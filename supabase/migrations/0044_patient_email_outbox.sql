-- Patient emails: booking confirmations, reminders, cancellations and email
-- review requests (LOCAL ONLY until explicitly approved for hosted).
--
-- Contract:
-- * Every patient email is a row in public.patient_email_outbox. Rows are only
--   written by triggers / SECURITY DEFINER functions, never by browser code.
-- * Nothing is enqueued unless the tenant turns the matching toggle on in
--   public.patient_email_settings (all default to off).
-- * Delivery is done by the `patient-email-dispatch` Edge Function using the
--   service role. Claiming re-validates every row at send time (appointment
--   still active, time unchanged, review request still approved, no email
--   opt-out), so stale reminders are never sent.
-- * The dispatcher refuses to claim anything while no real email provider is
--   configured, so rows are never marked "sent" by the console adapter.
-- * Review requests keep the existing approval gate. A tenant may opt in to
--   auto-approving email review requests created by workflows.
-- * No HTTP call, cron job or provider secret is created by this migration.

begin;

-- ---------------------------------------------------------------------------
-- 1. Per-tenant settings (one row per tenant, created on first save)
-- ---------------------------------------------------------------------------
create table if not exists public.patient_email_settings (
  tenant_id uuid primary key references public.businesses(id) on delete cascade,
  confirmations_enabled boolean not null default false,
  reminders_enabled boolean not null default false,
  reminder_hours_before integer not null default 24
    check (reminder_hours_before between 1 and 72),
  review_emails_auto_approve boolean not null default false,
  reply_to_email text
    check (reply_to_email is null or (length(reply_to_email) <= 320 and reply_to_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists patient_email_settings_set_updated_at on public.patient_email_settings;
create trigger patient_email_settings_set_updated_at
before update on public.patient_email_settings
for each row execute function public.set_updated_at();

alter table public.patient_email_settings enable row level security;

drop policy if exists "patient_email_settings_select" on public.patient_email_settings;
create policy "patient_email_settings_select" on public.patient_email_settings
  for select to authenticated using (public.can_manage_bookings(tenant_id));

revoke all on public.patient_email_settings from anon, authenticated;
grant select on public.patient_email_settings to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Outbox
-- ---------------------------------------------------------------------------
create table if not exists public.patient_email_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind in (
    'booking_confirmation', 'booking_rescheduled', 'booking_cancelled',
    'appointment_reminder', 'review_request'
  )),
  appointment_id uuid references public.appointments(id) on delete cascade,
  review_request_id uuid references public.review_requests(id) on delete cascade,
  -- Start time the email was written for. A reminder is skipped if it changed.
  appointment_start_at timestamptz,
  to_email text not null check (length(to_email) <= 320),
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled')),
  send_after timestamptz not null default now(),
  attempts integer not null default 0 check (attempts between 0 and 20),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider text,
  provider_message_id text,
  last_error text,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, dedupe_key)
);

create index if not exists patient_email_outbox_due_idx
  on public.patient_email_outbox(send_after)
  where status in ('pending', 'sending');
create index if not exists patient_email_outbox_tenant_idx
  on public.patient_email_outbox(tenant_id, created_at desc);
create index if not exists patient_email_outbox_appointment_idx
  on public.patient_email_outbox(appointment_id)
  where appointment_id is not null;

drop trigger if exists patient_email_outbox_set_updated_at on public.patient_email_outbox;
create trigger patient_email_outbox_set_updated_at
before update on public.patient_email_outbox
for each row execute function public.set_updated_at();

alter table public.patient_email_outbox enable row level security;

drop policy if exists "patient_email_outbox_select" on public.patient_email_outbox;
create policy "patient_email_outbox_select" on public.patient_email_outbox
  for select to authenticated using (public.can_manage_bookings(tenant_id));

revoke all on public.patient_email_outbox from anon, authenticated;
grant select on public.patient_email_outbox to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Settings RPC (manager+)
-- ---------------------------------------------------------------------------
create or replace function public.patient_email_update_settings(
  p_tenant uuid,
  p_confirmations_enabled boolean,
  p_reminders_enabled boolean,
  p_reminder_hours_before integer,
  p_review_emails_auto_approve boolean,
  p_reply_to_email text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reply text := nullif(btrim(coalesce(p_reply_to_email, '')), '');
begin
  if not public.can_manage_bookings(p_tenant) then
    raise exception 'Access denied';
  end if;
  if p_reminder_hours_before is null or p_reminder_hours_before not between 1 and 72 then
    raise exception 'Reminder hours must be between 1 and 72';
  end if;

  insert into public.patient_email_settings (
    tenant_id, confirmations_enabled, reminders_enabled, reminder_hours_before,
    review_emails_auto_approve, reply_to_email, updated_by
  ) values (
    p_tenant, coalesce(p_confirmations_enabled, false), coalesce(p_reminders_enabled, false),
    p_reminder_hours_before, coalesce(p_review_emails_auto_approve, false), v_reply, auth.uid()
  )
  on conflict (tenant_id) do update set
    confirmations_enabled = excluded.confirmations_enabled,
    reminders_enabled = excluded.reminders_enabled,
    reminder_hours_before = excluded.reminder_hours_before,
    review_emails_auto_approve = excluded.review_emails_auto_approve,
    reply_to_email = excluded.reply_to_email,
    updated_by = excluded.updated_by;

  -- Turning reminders off withdraws reminders that have not gone out yet.
  if not coalesce(p_reminders_enabled, false) then
    update public.patient_email_outbox
    set status = 'cancelled', last_error = 'reminders_disabled'
    where tenant_id = p_tenant and kind = 'appointment_reminder' and status = 'pending';
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, auth.uid(), 'patient_email.settings_updated', 'patient_email_settings', p_tenant::text,
    jsonb_build_object(
      'confirmations_enabled', coalesce(p_confirmations_enabled, false),
      'reminders_enabled', coalesce(p_reminders_enabled, false),
      'reminder_hours_before', p_reminder_hours_before,
      'review_emails_auto_approve', coalesce(p_review_emails_auto_approve, false),
      'reply_to_set', v_reply is not null
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Enqueue helpers and appointment trigger
-- ---------------------------------------------------------------------------
create or replace function public.patient_email_enqueue(
  p_tenant uuid,
  p_kind text,
  p_to text,
  p_dedupe text,
  p_send_after timestamptz,
  p_appointment uuid default null,
  p_start_at timestamptz default null,
  p_review_request uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_to text := lower(nullif(btrim(coalesce(p_to, '')), ''));
begin
  if v_to is null or v_to !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(v_to) > 320 then
    return;
  end if;
  insert into public.patient_email_outbox (
    tenant_id, kind, appointment_id, review_request_id, appointment_start_at,
    to_email, send_after, dedupe_key
  ) values (
    p_tenant, p_kind, p_appointment, p_review_request, p_start_at,
    v_to, coalesce(p_send_after, now()), p_dedupe
  )
  on conflict (tenant_id, dedupe_key) do nothing;
end;
$$;

create or replace function public.patient_email_on_appointment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.patient_email_settings%rowtype;
  v_email text;
  v_epoch text := floor(extract(epoch from new.start_at))::bigint::text;
  v_reminder_at timestamptz;
  v_active boolean := new.status in ('pending', 'scheduled', 'confirmed');
  v_was_active boolean;
begin
  select * into v_settings from public.patient_email_settings where tenant_id = new.tenant_id;
  if not found then return new; end if;
  if not (v_settings.confirmations_enabled or v_settings.reminders_enabled) then return new; end if;

  v_email := nullif(btrim(coalesce(new.customer_email, '')), '');
  if v_email is null and new.contact_id is not null then
    select nullif(btrim(coalesce(c.email, '')), '') into v_email
    from public.contacts c where c.id = new.contact_id and c.tenant_id = new.tenant_id;
  end if;

  v_reminder_at := new.start_at - make_interval(hours => v_settings.reminder_hours_before);

  if tg_op = 'INSERT' then
    if not v_active or new.start_at <= now() then return new; end if;
    if v_settings.confirmations_enabled then
      perform public.patient_email_enqueue(new.tenant_id, 'booking_confirmation', v_email,
        'confirmation:' || new.id::text, now(), new.id, new.start_at);
    end if;
    if v_settings.reminders_enabled and v_reminder_at > now() + interval '15 minutes' then
      perform public.patient_email_enqueue(new.tenant_id, 'appointment_reminder', v_email,
        'reminder:' || new.id::text || ':' || v_epoch, v_reminder_at, new.id, new.start_at);
    end if;
    return new;
  end if;

  -- UPDATE
  v_was_active := old.status in ('pending', 'scheduled', 'confirmed');

  if new.start_at is distinct from old.start_at and v_active then
    update public.patient_email_outbox
    set status = 'cancelled', last_error = 'rescheduled'
    where appointment_id = new.id and kind = 'appointment_reminder' and status = 'pending';

    if new.start_at > now() then
      if v_settings.confirmations_enabled then
        perform public.patient_email_enqueue(new.tenant_id, 'booking_rescheduled', v_email,
          'rescheduled:' || new.id::text || ':' || v_epoch, now(), new.id, new.start_at);
      end if;
      if v_settings.reminders_enabled and v_reminder_at > now() + interval '15 minutes' then
        perform public.patient_email_enqueue(new.tenant_id, 'appointment_reminder', v_email,
          'reminder:' || new.id::text || ':' || v_epoch, v_reminder_at, new.id, new.start_at);
      end if;
    end if;
  end if;

  if v_was_active and not v_active then
    update public.patient_email_outbox
    set status = 'cancelled', last_error = 'appointment_' || new.status
    where appointment_id = new.id
      and kind in ('appointment_reminder', 'booking_confirmation', 'booking_rescheduled')
      and status = 'pending';

    if new.status = 'cancelled' and v_settings.confirmations_enabled and new.start_at > now() then
      perform public.patient_email_enqueue(new.tenant_id, 'booking_cancelled', v_email,
        'cancelled:' || new.id::text || ':' || v_epoch, now(), new.id, new.start_at);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists patient_email_appointment_change on public.appointments;
create trigger patient_email_appointment_change
after insert or update of status, start_at on public.appointments
for each row execute function public.patient_email_on_appointment_change();

-- ---------------------------------------------------------------------------
-- 5. Email review requests: optional auto-approve + enqueue on approval
-- ---------------------------------------------------------------------------
create or replace function public.patient_email_review_auto_approve()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.channel = 'email' and new.status = 'pending_approval' and exists (
    select 1 from public.patient_email_settings s
    where s.tenant_id = new.tenant_id and s.review_emails_auto_approve
  ) then
    new.status := 'approved';
    new.approved_at := now();
    insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      new.tenant_id, null, 'patient_email.review_auto_approved', 'review_request', new.id::text,
      jsonb_build_object('channel', 'email', 'auto_approved', true)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists patient_email_review_auto_approve on public.review_requests;
create trigger patient_email_review_auto_approve
before insert on public.review_requests
for each row execute function public.patient_email_review_auto_approve();

create or replace function public.patient_email_on_review_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.channel <> 'email' or new.status <> 'approved' then return new; end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;
  perform public.patient_email_enqueue(
    new.tenant_id, 'review_request', new.customer_email,
    'review:' || new.id::text, greatest(coalesce(new.scheduled_for, now()), now()),
    new.appointment_id, null, new.id
  );
  return new;
end;
$$;

drop trigger if exists patient_email_review_request_change on public.review_requests;
create trigger patient_email_review_request_change
after insert or update of status on public.review_requests
for each row execute function public.patient_email_on_review_request();

-- ---------------------------------------------------------------------------
-- 6. Dispatcher RPCs (service_role only)
-- ---------------------------------------------------------------------------
-- Shared email opt-out check. Every patient email kind is checked at claim
-- time, not only review requests.
create or replace function public.patient_email_contact_opted_out(
  p_tenant uuid,
  p_contact uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_contact is not null and exists (
    select 1 from public.communication_consents cc
    where cc.tenant_id = p_tenant
      and cc.contact_id = p_contact
      and cc.channel = 'email'
      and (cc.status = 'opt_out' or cc.revoked_at is not null)
  );
$$;

create or replace function public.patient_email_claim_due(p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_out jsonb := '[]'::jsonb;
  v_skip text;
  v_appt public.appointments%rowtype;
  v_rr public.review_requests%rowtype;
  v_business public.businesses%rowtype;
  v_settings public.patient_email_settings%rowtype;
  v_service_name text;
  v_slug text;
  v_contact_name text;
  v_contact uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  for v_row in
    select o.* from public.patient_email_outbox o
    where (o.status = 'pending' and o.send_after <= now())
       or (o.status = 'sending' and o.claimed_at < now() - interval '15 minutes')
    order by o.send_after
    limit v_limit
    for update skip locked
  loop
    v_skip := null;
    v_appt := null;
    v_rr := null;
    v_service_name := null;
    v_slug := null;
    v_contact_name := null;

    select * into v_business from public.businesses where id = v_row.tenant_id;
    if v_business.status <> 'active' then v_skip := 'business_inactive'; end if;

    select * into v_settings from public.patient_email_settings where tenant_id = v_row.tenant_id;

    if v_skip is null and v_row.appointment_id is not null then
      select * into v_appt from public.appointments
      where id = v_row.appointment_id and tenant_id = v_row.tenant_id;
      if not found then v_skip := 'appointment_missing'; end if;
    end if;

    if v_skip is null and v_row.kind in ('booking_confirmation', 'booking_rescheduled', 'appointment_reminder') then
      if v_appt.status not in ('pending', 'scheduled', 'confirmed') then
        v_skip := 'appointment_' || v_appt.status;
      elsif v_appt.start_at is distinct from v_row.appointment_start_at then
        v_skip := 'time_changed';
      elsif v_appt.start_at <= now() then
        v_skip := 'appointment_started';
      elsif v_row.kind = 'appointment_reminder' and not coalesce(v_settings.reminders_enabled, false) then
        v_skip := 'reminders_disabled';
      elsif v_row.kind <> 'appointment_reminder' and not coalesce(v_settings.confirmations_enabled, false) then
        v_skip := 'confirmations_disabled';
      end if;
    end if;

    if v_skip is null and v_row.kind = 'booking_cancelled' then
      if v_appt.status <> 'cancelled' then
        v_skip := 'no_longer_cancelled';
      elsif not coalesce(v_settings.confirmations_enabled, false) then
        v_skip := 'confirmations_disabled';
      elsif v_appt.start_at <= now() then
        v_skip := 'appointment_started';
      end if;
    end if;

    if v_skip is null and v_row.kind = 'review_request' then
      select * into v_rr from public.review_requests
      where id = v_row.review_request_id and tenant_id = v_row.tenant_id;
      if not found then
        v_skip := 'review_request_missing';
      elsif v_rr.status <> 'approved' then
        v_skip := 'review_request_' || v_rr.status;
      end if;
    end if;

    -- Email opt-out applies to every patient email kind, not just review
    -- requests. Resolve the linked contact from the review request or the
    -- appointment and re-check consent at claim time.
    if v_skip is null then
      if v_row.kind = 'review_request' then
        v_contact := v_rr.contact_id;
      else
        v_contact := v_appt.contact_id;
      end if;
      if public.patient_email_contact_opted_out(v_row.tenant_id, v_contact) then
        v_skip := 'opted_out';
      end if;
    end if;

    if v_skip is null and v_row.attempts >= 5 then
      v_skip := 'too_many_attempts';
    end if;

    if v_skip is not null then
      update public.patient_email_outbox
      set status = case when v_skip = 'too_many_attempts' then 'failed' else 'skipped' end,
          last_error = v_skip
      where id = v_row.id;
      continue;
    end if;

    if v_appt.id is not null then
      select s.name into v_service_name from public.services s
      where s.id = v_appt.service_id and s.tenant_id = v_appt.tenant_id;
      select p.slug into v_slug from public.booking_pages p
      where p.id = v_appt.booking_page_id and p.tenant_id = v_appt.tenant_id;
      if v_appt.contact_id is not null then
        select nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), '') into v_contact_name
        from public.contacts c where c.id = v_appt.contact_id and c.tenant_id = v_appt.tenant_id;
      end if;
    end if;

    update public.patient_email_outbox
    set status = 'sending', attempts = attempts + 1, claimed_at = now()
    where id = v_row.id;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', v_row.id,
      'tenant_id', v_row.tenant_id,
      'kind', v_row.kind,
      'to_email', v_row.to_email,
      'customer_name', coalesce(
        nullif(btrim(coalesce(v_rr.customer_name, '')), ''),
        nullif(btrim(coalesce(v_appt.customer_name, '')), ''),
        v_contact_name
      ),
      'business_name', v_business.name,
      'business_phone', v_business.phone,
      'business_email', v_business.email,
      'timezone', coalesce(v_business.timezone, 'Asia/Kolkata'),
      'reply_to', coalesce(v_settings.reply_to_email, v_business.email),
      'service_name', v_service_name,
      'start_at', v_appt.start_at,
      'end_at', v_appt.end_at,
      'booking_slug', v_slug,
      'review_link_type', v_rr.review_link_type,
      'review_url', v_rr.review_url,
      'review_token', v_rr.public_token,
      'review_message', v_rr.message_template
    ));
  end loop;

  return v_out;
end;
$$;

create or replace function public.patient_email_mark_result(
  p_id uuid,
  p_ok boolean,
  p_provider text default null,
  p_provider_message_id text default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.patient_email_outbox%rowtype;
  v_final boolean;
begin
  select * into v_row from public.patient_email_outbox where id = p_id for update;
  if not found or v_row.status <> 'sending' then return; end if;

  if p_ok then
    update public.patient_email_outbox
    set status = 'sent', sent_at = now(), provider = left(p_provider, 40),
        provider_message_id = left(p_provider_message_id, 200), last_error = null
    where id = p_id;

    if v_row.review_request_id is not null then
      update public.review_requests
      set status = 'sent', sent_at = now(), last_error = null
      where id = v_row.review_request_id and tenant_id = v_row.tenant_id and status = 'approved';
    end if;

    insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_row.tenant_id, null, 'patient_email.sent', 'patient_email_outbox', p_id::text,
      jsonb_build_object('kind', v_row.kind, 'provider', left(p_provider, 40),
        'appointment_id', v_row.appointment_id, 'review_request_id', v_row.review_request_id));
    return;
  end if;

  v_final := v_row.attempts >= 5;
  update public.patient_email_outbox
  set status = case when v_final then 'failed' else 'pending' end,
      send_after = now() + make_interval(mins => 5 * v_row.attempts * v_row.attempts),
      provider = left(p_provider, 40),
      last_error = left(coalesce(p_error, 'send_failed'), 500)
  where id = p_id;

  if v_final then
    if v_row.review_request_id is not null then
      update public.review_requests
      set status = 'failed', last_error = left(coalesce(p_error, 'send_failed'), 500)
      where id = v_row.review_request_id and tenant_id = v_row.tenant_id and status = 'approved';
    end if;
    insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
    values (v_row.tenant_id, null, 'patient_email.failed', 'patient_email_outbox', p_id::text,
      jsonb_build_object('kind', v_row.kind, 'attempts', v_row.attempts,
        'error', left(coalesce(p_error, 'send_failed'), 200)));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.patient_email_update_settings(uuid, boolean, boolean, integer, boolean, text) from public, anon;
grant execute on function public.patient_email_update_settings(uuid, boolean, boolean, integer, boolean, text) to authenticated;

revoke all on function public.patient_email_enqueue(uuid, text, text, text, timestamptz, uuid, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.patient_email_on_appointment_change() from public, anon, authenticated;
revoke all on function public.patient_email_review_auto_approve() from public, anon, authenticated;
revoke all on function public.patient_email_on_review_request() from public, anon, authenticated;

revoke all on function public.patient_email_contact_opted_out(uuid, uuid) from public, anon, authenticated;
grant execute on function public.patient_email_contact_opted_out(uuid, uuid) to service_role;

revoke all on function public.patient_email_claim_due(integer) from public, anon, authenticated;
revoke all on function public.patient_email_mark_result(uuid, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.patient_email_claim_due(integer) to service_role;
grant execute on function public.patient_email_mark_result(uuid, boolean, text, text, text) to service_role;

commit;
