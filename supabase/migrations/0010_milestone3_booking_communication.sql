-- Milestone 3: booking system and communication foundation.
--
-- Design rules (same contract as Milestone 2):
-- * Tenant identity always comes from the caller's authenticated membership,
--   never from a request payload. Public operations derive it from a booking
--   page slug or a high-entropy management token.
-- * RLS remains authoritative for direct table access. RPCs are SECURITY
--   DEFINER with a pinned search_path and re-check membership/roles internally.
-- * All timestamps are timestamptz (UTC); business-local walls are computed
--   from businesses.timezone on the server, never trusted from the browser.
-- * Availability is revalidated inside the booking transaction under a
--   transaction-scoped advisory lock, and a GiST exclusion constraint makes
--   overlapping appointments impossible for every write path. Cancelled/no-show
--   appointments never block a slot.
-- * Clients cannot write audit_logs, notifications or webhook_events directly.
--
begin;

-- ---------------------------------------------------------------------------
-- 1. Permission helpers
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_bookings(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_tenant_role(p_tenant, array['owner', 'admin', 'manager']);
$$;

comment on function public.can_manage_bookings(uuid) is
  'True for owner/admin/manager of an active membership. Config-level booking writes.';

-- ---------------------------------------------------------------------------
-- 2. New tenant-owned tables
-- ---------------------------------------------------------------------------

create table public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  duration_minutes integer not null default 30
    check (duration_minutes between 1 and 480),
  price numeric(12, 2) not null default 0 check (price >= 0),
  currency text not null default 'INR',
  buffer_before_minutes integer not null default 0
    check (buffer_before_minutes between 0 and 240),
  buffer_after_minutes integer not null default 0
    check (buffer_after_minutes between 0 and 240),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, name)
);

create index services_tenant_idx on public.services(tenant_id, active, name);

create trigger services_set_updated_at
before update on public.services
for each row execute function public.set_updated_at();

create table public.booking_resources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  kind text not null default 'employee'
    check (kind in ('employee', 'room', 'equipment')),
  member_user_id uuid,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, name),
  foreign key (tenant_id, member_user_id)
    references public.business_members(tenant_id, user_id)
    on delete set null (member_user_id)
);

create index booking_resources_tenant_idx
  on public.booking_resources(tenant_id, kind, active);

create trigger booking_resources_set_updated_at
before update on public.booking_resources
for each row execute function public.set_updated_at();

create table public.service_resources (
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  service_id uuid not null,
  resource_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (service_id, resource_id),
  foreign key (service_id, tenant_id)
    references public.services(id, tenant_id) on delete cascade,
  foreign key (resource_id, tenant_id)
    references public.booking_resources(id, tenant_id) on delete cascade
);

create index service_resources_tenant_idx
  on public.service_resources(tenant_id, service_id);

-- day_of_week follows PostgreSQL DOW: 0 = Sunday ... 6 = Saturday.
create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  resource_id uuid,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  valid_from date,
  valid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  check (valid_until is null or valid_from is null or valid_until >= valid_from),
  unique (id, tenant_id),
  foreign key (resource_id, tenant_id)
    references public.booking_resources(id, tenant_id) on delete cascade
);

create index availability_rules_lookup_idx
  on public.availability_rules(tenant_id, resource_id, day_of_week)
  where is_active = true;

create trigger availability_rules_set_updated_at
before update on public.availability_rules
for each row execute function public.set_updated_at();

create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  resource_id uuid,
  exception_type text not null default 'blocked'
    check (exception_type in ('blocked', 'available', 'break')),
  title text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  unique (id, tenant_id),
  foreign key (resource_id, tenant_id)
    references public.booking_resources(id, tenant_id) on delete cascade
);

create index availability_exceptions_lookup_idx
  on public.availability_exceptions(tenant_id, resource_id, start_at, end_at);

create trigger availability_exceptions_set_updated_at
before update on public.availability_exceptions
for each row execute function public.set_updated_at();

create table public.booking_pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null default 'Book an appointment',
  description text,
  primary_color text default '#4f46e5',
  logo_url text,
  lead_time_minutes integer not null default 60
    check (lead_time_minutes between 0 and 10080),
  booking_horizon_days integer not null default 60
    check (booking_horizon_days between 1 and 365),
  slot_interval_minutes integer not null default 15
    check (slot_interval_minutes between 5 and 240),
  require_email boolean not null default true,
  require_phone boolean not null default true,
  allow_cancellation boolean not null default true,
  allow_rescheduling boolean not null default true,
  cancellation_hours integer not null default 4
    check (cancellation_hours between 0 and 720),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create index booking_pages_tenant_idx on public.booking_pages(tenant_id, active);

create trigger booking_pages_set_updated_at
before update on public.booking_pages
for each row execute function public.set_updated_at();

create table public.booking_page_services (
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  booking_page_id uuid not null,
  service_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (booking_page_id, service_id),
  foreign key (booking_page_id, tenant_id)
    references public.booking_pages(id, tenant_id) on delete cascade,
  foreign key (service_id, tenant_id)
    references public.services(id, tenant_id) on delete cascade
);

create index booking_page_services_tenant_idx
  on public.booking_page_services(tenant_id, booking_page_id);

create table public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  appointment_id uuid not null,
  event_type text not null
    check (event_type in (
      'created', 'confirmed', 'rescheduled', 'cancelled', 'completed',
      'no_show', 'assigned', 'note', 'status_changed'
    )),
  from_status text,
  to_status text,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_type text not null default 'staff'
    check (actor_type in ('staff', 'customer', 'system')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (appointment_id, tenant_id)
    references public.appointments(id, tenant_id) on delete cascade,
  unique (id, tenant_id)
);

create index appointment_events_appointment_idx
  on public.appointment_events(tenant_id, appointment_id, created_at);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  channel_type text not null default 'internal'
    check (channel_type in (
      'internal', 'email', 'whatsapp', 'website_chat', 'sms', 'instagram', 'other'
    )),
  identifier text,
  status text not null default 'connected'
    check (status in ('connected', 'disconnected', 'error')),
  config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, name)
);

create index channels_tenant_idx on public.channels(tenant_id, channel_type, active);

create trigger channels_set_updated_at
before update on public.channels
for each row execute function public.set_updated_at();

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.businesses(id) on delete cascade,
  provider text not null,
  event_type text not null,
  external_id text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'processed', 'failed', 'ignored')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, external_id)
);

create index webhook_events_tenant_idx
  on public.webhook_events(tenant_id, provider, received_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null
    check (notification_type in (
      'appointment_new', 'appointment_confirmed', 'appointment_cancelled',
      'appointment_rescheduled', 'appointment_upcoming', 'conversation_assigned',
      'message_received'
    )),
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  delivery_channel text not null default 'in_app'
    check (delivery_channel in ('in_app', 'email')),
  delivery_status text not null default 'sent'
    check (delivery_status in ('pending', 'sent', 'failed', 'skipped')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (tenant_id, user_id)
    references public.business_members(tenant_id, user_id) on delete cascade
);

create index notifications_recipient_idx
  on public.notifications(tenant_id, user_id, created_at desc);
create index notifications_unread_idx
  on public.notifications(tenant_id, user_id)
  where read_at is null;

-- ---------------------------------------------------------------------------
-- 3. Extend the existing appointment / conversation / message stubs
-- ---------------------------------------------------------------------------

-- Legacy assignments point at profiles directly; retarget them at tenant
-- memberships so an employee from another tenant can never be assigned.
update public.appointments a
set assigned_to = null
where a.assigned_to is not null
  and not exists (
    select 1 from public.business_members m
    where m.tenant_id = a.tenant_id and m.user_id = a.assigned_to
  );
update public.conversations c
set assigned_to = null
where c.assigned_to is not null
  and not exists (
    select 1 from public.business_members m
    where m.tenant_id = c.tenant_id and m.user_id = c.assigned_to
  );

alter table public.appointments
  drop constraint if exists appointments_assigned_to_fkey,
  drop constraint if exists appointments_status_check;

alter table public.appointments
  add column if not exists service_id uuid,
  add column if not exists resource_id uuid,
  add column if not exists booking_page_id uuid,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists customer_email text,
  add column if not exists booking_source text not null default 'staff'
    check (booking_source in ('staff', 'public_booking', 'import', 'api')),
  add column if not exists notes text,
  add column if not exists idempotency_key text,
  add column if not exists manage_token text,
  add column if not exists rescheduled_from uuid,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.appointments
  add constraint appointments_status_check
    check (status in ('pending', 'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  add constraint appointments_assigned_member_fkey
    foreign key (tenant_id, assigned_to)
    references public.business_members(tenant_id, user_id)
    on delete set null (assigned_to),
  add constraint appointments_service_fkey
    foreign key (service_id, tenant_id)
    references public.services(id, tenant_id) on delete set null,
  add constraint appointments_resource_fkey
    foreign key (resource_id, tenant_id)
    references public.booking_resources(id, tenant_id) on delete set null,
  add constraint appointments_page_fkey
    foreign key (booking_page_id, tenant_id)
    references public.booking_pages(id, tenant_id) on delete set null,
  add constraint appointments_rescheduled_from_fkey
    foreign key (rescheduled_from, tenant_id)
    references public.appointments(id, tenant_id) on delete set null;

create unique index appointments_idempotency_key_idx
  on public.appointments(tenant_id, idempotency_key)
  where idempotency_key is not null;
create unique index appointments_manage_token_idx
  on public.appointments(manage_token)
  where manage_token is not null;
create index appointments_resource_window_idx
  on public.appointments(tenant_id, resource_id, start_at, end_at);
create index appointments_status_start_idx
  on public.appointments(tenant_id, status, start_at);

-- Database-level double-booking guard. The advisory locks in the booking RPCs
-- serialize the normal slot-allocation path, but their keys include the
-- selected resource: an explicit-resource request and an auto-assigned one can
-- take different locks. This exclusion constraint is the authoritative
-- guarantee for every write path (including cross-day spillover and direct
-- writes) and needs no application code to be correct. Cancelled/no-show
-- appointments are excluded so their history is kept and their slot is reusable.
create extension if not exists btree_gist with schema extensions;

alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    tenant_id with =,
    resource_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  )
  where (resource_id is not null and status not in ('cancelled', 'no_show'));

alter table public.conversations
  drop constraint if exists conversations_assigned_to_fkey;

alter table public.conversations
  add column if not exists channel_id uuid,
  add column if not exists subject text,
  add column if not exists last_message_at timestamptz,
  add column if not exists priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  add column if not exists unread_count integer not null default 0
    check (unread_count >= 0),
  add column if not exists customer_name text,
  add column if not exists customer_email text;

alter table public.conversations
  add constraint conversations_assigned_member_fkey
    foreign key (tenant_id, assigned_to)
    references public.business_members(tenant_id, user_id)
    on delete set null (assigned_to),
  add constraint conversations_channel_fkey
    foreign key (channel_id, tenant_id)
    references public.channels(id, tenant_id) on delete set null;

create index conversations_last_message_idx
  on public.conversations(tenant_id, last_message_at desc);

alter table public.messages
  add column if not exists message_type text not null default 'text'
    check (message_type in ('text', 'image', 'file', 'system', 'email', 'whatsapp')),
  add column if not exists is_internal boolean not null default false,
  add column if not exists author_id uuid references public.profiles(id) on delete set null,
  add column if not exists author_type text not null default 'staff'
    check (author_type in ('staff', 'customer', 'system', 'bot')),
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create unique index messages_external_id_idx
  on public.messages(tenant_id, provider_message_id)
  where provider_message_id is not null;
create index messages_unread_idx
  on public.messages(tenant_id, conversation_id, created_at)
  where direction = 'inbound' and read_at is null;

create trigger messages_set_updated_at
before update on public.messages
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RLS and grants
-- ---------------------------------------------------------------------------

alter table public.services enable row level security;
alter table public.booking_resources enable row level security;
alter table public.service_resources enable row level security;
alter table public.availability_rules enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.booking_pages enable row level security;
alter table public.booking_page_services enable row level security;
alter table public.appointment_events enable row level security;
alter table public.channels enable row level security;
alter table public.webhook_events enable row level security;
alter table public.notifications enable row level security;

-- Replace the broad M1 stubs with role-aware policies.
drop policy if exists "Tenant appointments access" on public.appointments;
drop policy if exists "Tenant conversations access" on public.conversations;
drop policy if exists "Tenant messages access" on public.messages;

create policy "Booking: read appointments" on public.appointments
  for select to authenticated
  using (public.has_tenant_access(tenant_id));
create policy "Booking: create appointments" on public.appointments
  for insert to authenticated
  with check (public.has_tenant_access(tenant_id));
create policy "Booking: update appointments" on public.appointments
  for update to authenticated
  using (public.has_tenant_access(tenant_id))
  with check (public.has_tenant_access(tenant_id));
create policy "Booking: delete appointments" on public.appointments
  for delete to authenticated
  using (public.can_manage_bookings(tenant_id));

create policy "Inbox: read conversations" on public.conversations
  for select to authenticated
  using (public.has_tenant_access(tenant_id));
create policy "Inbox: create conversations" on public.conversations
  for insert to authenticated
  with check (public.has_tenant_access(tenant_id));
create policy "Inbox: update conversations" on public.conversations
  for update to authenticated
  using (public.has_tenant_access(tenant_id))
  with check (public.has_tenant_access(tenant_id));
create policy "Inbox: delete conversations" on public.conversations
  for delete to authenticated
  using (public.can_manage_bookings(tenant_id));

create policy "Inbox: read messages" on public.messages
  for select to authenticated
  using (public.has_tenant_access(tenant_id));
create policy "Inbox: create messages" on public.messages
  for insert to authenticated
  with check (public.has_tenant_access(tenant_id));
create policy "Inbox: update messages" on public.messages
  for update to authenticated
  using (public.has_tenant_access(tenant_id))
  with check (public.has_tenant_access(tenant_id));
create policy "Inbox: delete messages" on public.messages
  for delete to authenticated
  using (public.can_manage_bookings(tenant_id));

-- Configuration: readable by members, writable by owner/admin/manager.
create policy "Booking: read services" on public.services
  for select to authenticated
  using (public.has_tenant_access(tenant_id));
create policy "Booking: manage services" on public.services
  for all to authenticated
  using (public.can_manage_bookings(tenant_id))
  with check (public.can_manage_bookings(tenant_id));

create policy "Booking: read resources" on public.booking_resources
  for select to authenticated
  using (public.has_tenant_access(tenant_id));
create policy "Booking: manage resources" on public.booking_resources
  for all to authenticated
  using (public.can_manage_bookings(tenant_id))
  with check (public.can_manage_bookings(tenant_id));

create policy "Booking: read service resources" on public.service_resources
  for select to authenticated
  using (public.has_tenant_access(tenant_id));
create policy "Booking: manage service resources" on public.service_resources
  for all to authenticated
  using (public.can_manage_bookings(tenant_id))
  with check (public.can_manage_bookings(tenant_id));

create policy "Booking: read availability rules" on public.availability_rules
  for select to authenticated
  using (public.has_tenant_access(tenant_id));
create policy "Booking: manage availability rules" on public.availability_rules
  for all to authenticated
  using (public.can_manage_bookings(tenant_id))
  with check (public.can_manage_bookings(tenant_id));

create policy "Booking: read availability exceptions" on public.availability_exceptions
  for select to authenticated
  using (public.has_tenant_access(tenant_id));
create policy "Booking: manage availability exceptions" on public.availability_exceptions
  for all to authenticated
  using (public.can_manage_bookings(tenant_id))
  with check (public.can_manage_bookings(tenant_id));

create policy "Booking: read booking pages" on public.booking_pages
  for select to authenticated
  using (public.has_tenant_access(tenant_id));
create policy "Booking: manage booking pages" on public.booking_pages
  for all to authenticated
  using (public.can_manage_bookings(tenant_id))
  with check (public.can_manage_bookings(tenant_id));

create policy "Booking: read booking page services" on public.booking_page_services
  for select to authenticated
  using (public.has_tenant_access(tenant_id));
create policy "Booking: manage booking page services" on public.booking_page_services
  for all to authenticated
  using (public.can_manage_bookings(tenant_id))
  with check (public.can_manage_bookings(tenant_id));

-- Appointment history is append-only for clients.
create policy "Booking: read appointment events" on public.appointment_events
  for select to authenticated
  using (public.has_tenant_access(tenant_id));

create policy "Inbox: read channels" on public.channels
  for select to authenticated
  using (public.has_tenant_access(tenant_id));
create policy "Inbox: manage channels" on public.channels
  for all to authenticated
  using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
  with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

create policy "Inbox: admins read webhook events" on public.webhook_events
  for select to authenticated
  using (
    tenant_id is not null
    and public.has_tenant_role(tenant_id, array['owner', 'admin'])
  );

create policy "Notifications: read own" on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()) and public.has_tenant_access(tenant_id));
create policy "Notifications: mark own read" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()) and public.has_tenant_access(tenant_id))
  with check (user_id = (select auth.uid()) and public.has_tenant_access(tenant_id));

revoke all on public.services,
  public.booking_resources,
  public.service_resources,
  public.availability_rules,
  public.availability_exceptions,
  public.booking_pages,
  public.booking_page_services,
  public.appointment_events,
  public.channels,
  public.webhook_events,
  public.notifications from anon;

grant select, insert, update, delete on public.services,
  public.booking_resources,
  public.service_resources,
  public.availability_rules,
  public.availability_exceptions,
  public.booking_pages,
  public.booking_page_services,
  public.channels to authenticated;
grant select on public.appointment_events, public.webhook_events to authenticated;
grant select, update on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Per-tenant defaults (booking page + internal channel)
-- ---------------------------------------------------------------------------

create or replace function public.seed_booking_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.booking_pages (tenant_id, slug, title)
  values (new.id, new.slug, 'Book an appointment')
  on conflict (slug) do nothing;

  insert into public.channels (tenant_id, name, channel_type, status)
  values (new.id, 'Internal', 'internal', 'connected')
  on conflict (tenant_id, name) do nothing;

  return new;
end;
$$;

create trigger businesses_seed_booking_defaults
after insert on public.businesses
for each row execute function public.seed_booking_defaults();

revoke all on function public.seed_booking_defaults() from public;

-- Backfill tenants that predate this migration.
do $$
declare
  v_business record;
begin
  for v_business in select id, slug from public.businesses loop
    insert into public.booking_pages (tenant_id, slug, title)
    values (v_business.id, v_business.slug, 'Book an appointment')
    on conflict (slug) do nothing;

    insert into public.channels (tenant_id, name, channel_type, status)
    values (v_business.id, 'Internal', 'internal', 'connected')
    on conflict (tenant_id, name) do nothing;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Server-side availability engine
-- ---------------------------------------------------------------------------

create or replace function public.booking_compute_slots(
  p_tenant uuid,
  p_service_id uuid,
  p_resource_id uuid,
  p_date date,
  p_interval_minutes integer,
  p_lead_time_minutes integer,
  p_exclude_appointment uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_service public.services%rowtype;
  v_tz text;
  v_dow smallint;
  v_total_minutes integer;
  v_eligible uuid[];
  v_window record;
  v_cursor_min integer;
  v_end_min integer;
  v_slot_time time;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_chosen uuid;
  v_resource uuid;
  v_ok boolean;
  v_result jsonb := '[]'::jsonb;
begin
  select * into v_service
  from public.services
  where id = p_service_id and tenant_id = p_tenant and active = true;
  if not found then
    return v_result;
  end if;

  select coalesce(b.timezone, 'Asia/Kolkata') into v_tz
  from public.businesses b where b.id = p_tenant;
  if v_tz is null then
    v_tz := 'Asia/Kolkata';
  end if;

  -- p_date is already a business-local calendar date, so PostgreSQL DOW
  -- (0 = Sunday ... 6 = Saturday) is the correct weekday here.
  v_dow := extract(dow from p_date)::smallint;
  v_total_minutes := v_service.duration_minutes
    + v_service.buffer_before_minutes + v_service.buffer_after_minutes;

  if p_resource_id is not null then
    v_eligible := array[p_resource_id];
  else
    select coalesce(array_agg(r.id), '{}'::uuid[]) into v_eligible
    from public.booking_resources r
    where r.tenant_id = p_tenant
      and r.active = true
      and (
        exists (
          select 1 from public.service_resources sr
          where sr.tenant_id = p_tenant
            and sr.service_id = p_service_id
            and sr.resource_id = r.id
        )
        or not exists (
          select 1 from public.service_resources sr
          where sr.tenant_id = p_tenant and sr.service_id = p_service_id
        )
      );
  end if;

  if coalesce(array_length(v_eligible, 1), 0) = 0 then
    return v_result;
  end if;

  for v_window in
    select r.start_time as start_local, r.end_time as end_local
    from public.availability_rules r
    where r.tenant_id = p_tenant
      and r.is_active = true
      and r.day_of_week = v_dow
      and (r.resource_id is null or r.resource_id = any (v_eligible))
      and (r.valid_from is null or r.valid_from <= p_date)
      and (r.valid_until is null or r.valid_until >= p_date)
    union all
    select (x.start_at at time zone v_tz)::time, (x.end_at at time zone v_tz)::time
    from public.availability_exceptions x
    where x.tenant_id = p_tenant
      and x.exception_type = 'available'
      and (x.resource_id is null or x.resource_id = any (v_eligible))
      and x.start_at < (p_date + interval '1 day') at time zone v_tz
      and x.end_at > p_date at time zone v_tz
  loop
    v_cursor_min := extract(hour from v_window.start_local)::integer * 60
      + extract(minute from v_window.start_local)::integer;
    v_end_min := extract(hour from v_window.end_local)::integer * 60
      + extract(minute from v_window.end_local)::integer;

    while v_cursor_min + v_total_minutes <= v_end_min loop
      v_slot_time := make_time((v_cursor_min / 60)::integer, (v_cursor_min % 60)::integer, 0);
      v_slot_start := (p_date + v_slot_time) at time zone v_tz;
      v_slot_end := v_slot_start + (v_total_minutes || ' minutes')::interval;

      if v_slot_start >= now() + (p_lead_time_minutes || ' minutes')::interval then
        v_chosen := null;

        foreach v_resource in array v_eligible loop
          v_ok := not exists (
            select 1 from public.appointments a
            where a.tenant_id = p_tenant
              and a.resource_id = v_resource
              and a.status not in ('cancelled', 'no_show')
              and a.id <> coalesce(p_exclude_appointment, '00000000-0000-0000-0000-000000000000'::uuid)
              and a.start_at < v_slot_end
              and a.end_at > v_slot_start
          )
          and not exists (
            select 1 from public.availability_exceptions x
            where x.tenant_id = p_tenant
              and x.exception_type in ('blocked', 'break')
              and (x.resource_id is null or x.resource_id = v_resource)
              and x.start_at < v_slot_end
              and x.end_at > v_slot_start
          );

          if v_ok then
            v_chosen := v_resource;
            exit;
          end if;
        end loop;

        if v_chosen is not null then
          v_result := v_result || jsonb_build_array(
            jsonb_build_object(
              'start', to_jsonb(v_slot_start),
              'end', to_jsonb(v_slot_end),
              'resource_id', to_jsonb(v_chosen)
            )
          );
        end if;
      end if;

      v_cursor_min := v_cursor_min + p_interval_minutes;
    end loop;
  end loop;

  return v_result;
end;
$$;

comment on function public.booking_compute_slots(uuid, uuid, uuid, date, integer, integer, uuid) is
  'Computes bookable slots in the business timezone from rules, exceptions and live appointments. Never trusts client slot data.';

-- ---------------------------------------------------------------------------
-- 7. Service / resource / availability configuration RPCs
-- ---------------------------------------------------------------------------

create or replace function public.booking_create_service(
  p_tenant uuid,
  p_name text,
  p_description text default null,
  p_duration_minutes integer default 30,
  p_price numeric default 0,
  p_currency text default 'INR',
  p_buffer_before_minutes integer default 0,
  p_buffer_after_minutes integer default 0,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null
     or not public.has_tenant_access(p_tenant)
     or not public.can_manage_bookings(p_tenant) then
    raise exception 'Not allowed to manage services for this business';
  end if;
  if p_name is null or length(trim(p_name)) < 2 or length(p_name) > 120 then
    raise exception 'Service name must be 2-120 characters';
  end if;
  if p_duration_minutes is null or p_duration_minutes not between 1 and 480 then
    raise exception 'Duration must be between 1 and 480 minutes';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Price cannot be negative';
  end if;
  if p_currency is null or length(p_currency) <> 3 then
    raise exception 'Currency must be a 3-letter code';
  end if;

  insert into public.services (
    tenant_id, name, description, duration_minutes, price, currency,
    buffer_before_minutes, buffer_after_minutes, active
  ) values (
    p_tenant, trim(p_name), p_description, p_duration_minutes, p_price, upper(p_currency),
    coalesce(p_buffer_before_minutes, 0), coalesce(p_buffer_after_minutes, 0), p_active
  ) returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, (select auth.uid()), 'service.created', 'service', v_id::text,
          jsonb_build_object('name', trim(p_name)));
  return v_id;
end;
$$;

create or replace function public.booking_update_service(
  p_tenant uuid,
  p_service uuid,
  p_name text,
  p_description text default null,
  p_duration_minutes integer default 30,
  p_price numeric default 0,
  p_currency text default 'INR',
  p_buffer_before_minutes integer default 0,
  p_buffer_after_minutes integer default 0,
  p_active boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not public.has_tenant_access(p_tenant)
     or not public.can_manage_bookings(p_tenant) then
    raise exception 'Not allowed to manage services for this business';
  end if;
  if not exists (select 1 from public.services where id = p_service and tenant_id = p_tenant) then
    raise exception 'Service not found';
  end if;
  if p_name is null or length(trim(p_name)) < 2 or length(p_name) > 120 then
    raise exception 'Service name must be 2-120 characters';
  end if;
  if p_duration_minutes is null or p_duration_minutes not between 1 and 480 then
    raise exception 'Duration must be between 1 and 480 minutes';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Price cannot be negative';
  end if;

  update public.services
  set name = trim(p_name), description = p_description,
      duration_minutes = p_duration_minutes, price = p_price,
      currency = upper(p_currency),
      buffer_before_minutes = coalesce(p_buffer_before_minutes, 0),
      buffer_after_minutes = coalesce(p_buffer_after_minutes, 0),
      active = p_active
  where id = p_service and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'service.updated', 'service', p_service::text);
end;
$$;

create or replace function public.booking_set_service_active(
  p_tenant uuid,
  p_service uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not public.has_tenant_access(p_tenant)
     or not public.can_manage_bookings(p_tenant) then
    raise exception 'Not allowed to manage services for this business';
  end if;
  update public.services set active = p_active
  where id = p_service and tenant_id = p_tenant;
  if not found then
    raise exception 'Service not found';
  end if;
  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, (select auth.uid()), 'service.visibility_changed', 'service', p_service::text,
          jsonb_build_object('active', p_active));
end;
$$;

create or replace function public.booking_create_resource(
  p_tenant uuid,
  p_name text,
  p_kind text default 'employee',
  p_member_user_id uuid default null,
  p_notes text default null,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null
     or not public.has_tenant_access(p_tenant)
     or not public.can_manage_bookings(p_tenant) then
    raise exception 'Not allowed to manage resources for this business';
  end if;
  if p_name is null or length(trim(p_name)) < 2 or length(p_name) > 120 then
    raise exception 'Resource name must be 2-120 characters';
  end if;
  if p_kind not in ('employee', 'room', 'equipment') then
    raise exception 'Invalid resource kind';
  end if;
  if p_member_user_id is not null and not public.is_active_member(p_tenant, p_member_user_id) then
    raise exception 'Resource employee must be an active member of this business';
  end if;

  insert into public.booking_resources (
    tenant_id, name, kind, member_user_id, notes, active
  ) values (
    p_tenant, trim(p_name), p_kind, p_member_user_id, p_notes, p_active
  ) returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, (select auth.uid()), 'resource.created', 'booking_resource', v_id::text,
          jsonb_build_object('name', trim(p_name), 'kind', p_kind));
  return v_id;
end;
$$;

create or replace function public.booking_update_resource(
  p_tenant uuid,
  p_resource uuid,
  p_name text,
  p_kind text default 'employee',
  p_member_user_id uuid default null,
  p_notes text default null,
  p_active boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not public.has_tenant_access(p_tenant)
     or not public.can_manage_bookings(p_tenant) then
    raise exception 'Not allowed to manage resources for this business';
  end if;
  if not exists (select 1 from public.booking_resources where id = p_resource and tenant_id = p_tenant) then
    raise exception 'Resource not found';
  end if;
  if p_name is null or length(trim(p_name)) < 2 or length(p_name) > 120 then
    raise exception 'Resource name must be 2-120 characters';
  end if;
  if p_kind not in ('employee', 'room', 'equipment') then
    raise exception 'Invalid resource kind';
  end if;
  if p_member_user_id is not null and not public.is_active_member(p_tenant, p_member_user_id) then
    raise exception 'Resource employee must be an active member of this business';
  end if;

  update public.booking_resources
  set name = trim(p_name), kind = p_kind, member_user_id = p_member_user_id,
      notes = p_notes, active = p_active
  where id = p_resource and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'resource.updated', 'booking_resource', p_resource::text);
end;
$$;

create or replace function public.booking_set_service_resources(
  p_tenant uuid,
  p_service uuid,
  p_resource_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null
     or not public.has_tenant_access(p_tenant)
     or not public.can_manage_bookings(p_tenant) then
    raise exception 'Not allowed to manage services for this business';
  end if;
  if not exists (select 1 from public.services where id = p_service and tenant_id = p_tenant) then
    raise exception 'Service not found';
  end if;

  select count(*) into v_count
  from unnest(coalesce(p_resource_ids, '{}'::uuid[])) as rid
  where not exists (
    select 1 from public.booking_resources r
    where r.id = rid and r.tenant_id = p_tenant
  );
  if v_count > 0 then
    raise exception 'A resource does not belong to this business';
  end if;

  delete from public.service_resources
  where tenant_id = p_tenant and service_id = p_service;

  insert into public.service_resources (tenant_id, service_id, resource_id)
  select p_tenant, p_service, rid
  from unnest(coalesce(p_resource_ids, '{}'::uuid[])) as rid
  on conflict do nothing;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, (select auth.uid()), 'service.resources_set', 'service', p_service::text,
          jsonb_build_object('resource_count', coalesce(array_length(p_resource_ids, 1), 0)));
end;
$$;

create or replace function public.booking_upsert_availability_rule(
  p_tenant uuid,
  p_rule uuid default null,
  p_resource_id uuid default null,
  p_day_of_week smallint default 1,
  p_start_time time default time '09:00',
  p_end_time time default time '18:00',
  p_is_active boolean default true,
  p_valid_from date default null,
  p_valid_until date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null
     or not public.has_tenant_access(p_tenant)
     or not public.can_manage_bookings(p_tenant) then
    raise exception 'Not allowed to manage availability for this business';
  end if;
  if p_day_of_week is null or p_day_of_week not between 0 and 6 then
    raise exception 'Day of week must be 0 (Sunday) through 6 (Saturday)';
  end if;
  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'End time must be after start time';
  end if;
  if p_resource_id is not null and not exists (
    select 1 from public.booking_resources where id = p_resource_id and tenant_id = p_tenant
  ) then
    raise exception 'Resource not found';
  end if;

  if p_rule is null then
    insert into public.availability_rules (
      tenant_id, resource_id, day_of_week, start_time, end_time,
      is_active, valid_from, valid_until
    ) values (
      p_tenant, p_resource_id, p_day_of_week, p_start_time, p_end_time,
      p_is_active, p_valid_from, p_valid_until
    ) returning id into v_id;
  else
    if not exists (select 1 from public.availability_rules where id = p_rule and tenant_id = p_tenant) then
      raise exception 'Availability rule not found';
    end if;
    update public.availability_rules
    set resource_id = p_resource_id, day_of_week = p_day_of_week,
        start_time = p_start_time, end_time = p_end_time,
        is_active = p_is_active, valid_from = p_valid_from, valid_until = p_valid_until
    where id = p_rule and tenant_id = p_tenant;
    v_id := p_rule;
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'availability_rule.saved', 'availability_rule', v_id::text);
  return v_id;
end;
$$;

create or replace function public.booking_delete_availability_rule(
  p_tenant uuid,
  p_rule uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not public.has_tenant_access(p_tenant)
     or not public.can_manage_bookings(p_tenant) then
    raise exception 'Not allowed to manage availability for this business';
  end if;
  delete from public.availability_rules where id = p_rule and tenant_id = p_tenant;
  if not found then
    raise exception 'Availability rule not found';
  end if;
end;
$$;

create or replace function public.booking_create_exception(
  p_tenant uuid,
  p_resource_id uuid default null,
  p_exception_type text default 'blocked',
  p_title text default null,
  p_start_at timestamptz default null,
  p_end_at timestamptz default null,
  p_all_day boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null
     or not public.has_tenant_access(p_tenant)
     or not public.can_manage_bookings(p_tenant) then
    raise exception 'Not allowed to manage availability for this business';
  end if;
  if p_exception_type not in ('blocked', 'available', 'break') then
    raise exception 'Invalid exception type';
  end if;
  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
    raise exception 'End must be after start';
  end if;
  if p_resource_id is not null and not exists (
    select 1 from public.booking_resources where id = p_resource_id and tenant_id = p_tenant
  ) then
    raise exception 'Resource not found';
  end if;

  insert into public.availability_exceptions (
    tenant_id, resource_id, exception_type, title, start_at, end_at, all_day
  ) values (
    p_tenant, p_resource_id, p_exception_type, p_title, p_start_at, p_end_at, p_all_day
  ) returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, (select auth.uid()), 'availability_exception.created', 'availability_exception', v_id::text,
          jsonb_build_object('type', p_exception_type, 'start_at', p_start_at));
  return v_id;
end;
$$;

create or replace function public.booking_delete_exception(
  p_tenant uuid,
  p_exception uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not public.has_tenant_access(p_tenant)
     or not public.can_manage_bookings(p_tenant) then
    raise exception 'Not allowed to manage availability for this business';
  end if;
  delete from public.availability_exceptions where id = p_exception and tenant_id = p_tenant;
  if not found then
    raise exception 'Availability exception not found';
  end if;
end;
$$;

create or replace function public.booking_update_page_settings(
  p_tenant uuid,
  p_booking_page uuid,
  p_title text,
  p_description text default null,
  p_primary_color text default null,
  p_logo_url text default null,
  p_lead_time_minutes integer default 60,
  p_booking_horizon_days integer default 60,
  p_slot_interval_minutes integer default 15,
  p_require_email boolean default true,
  p_require_phone boolean default true,
  p_allow_cancellation boolean default true,
  p_allow_rescheduling boolean default true,
  p_cancellation_hours integer default 4,
  p_active boolean default true,
  p_service_ids uuid[] default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null
     or not public.has_tenant_access(p_tenant)
     or not public.can_manage_bookings(p_tenant) then
    raise exception 'Not allowed to manage booking page settings';
  end if;
  if not exists (select 1 from public.booking_pages where id = p_booking_page and tenant_id = p_tenant) then
    raise exception 'Booking page not found';
  end if;
  if p_title is null or length(trim(p_title)) < 2 or length(p_title) > 120 then
    raise exception 'Booking page title must be 2-120 characters';
  end if;
  if p_booking_horizon_days not between 1 and 365
     or p_slot_interval_minutes not between 5 and 240
     or p_lead_time_minutes not between 0 and 10080 then
    raise exception 'Invalid booking rule value';
  end if;

  select count(*) into v_count
  from unnest(coalesce(p_service_ids, '{}'::uuid[])) as sid
  where not exists (
    select 1 from public.services s where s.id = sid and s.tenant_id = p_tenant
  );
  if v_count > 0 then
    raise exception 'A service does not belong to this business';
  end if;

  update public.booking_pages
  set title = trim(p_title), description = p_description,
      primary_color = coalesce(p_primary_color, primary_color),
      logo_url = p_logo_url,
      lead_time_minutes = p_lead_time_minutes,
      booking_horizon_days = p_booking_horizon_days,
      slot_interval_minutes = p_slot_interval_minutes,
      require_email = p_require_email, require_phone = p_require_phone,
      allow_cancellation = p_allow_cancellation,
      allow_rescheduling = p_allow_rescheduling,
      cancellation_hours = p_cancellation_hours, active = p_active
  where id = p_booking_page and tenant_id = p_tenant;

  delete from public.booking_page_services
  where tenant_id = p_tenant and booking_page_id = p_booking_page;
  insert into public.booking_page_services (tenant_id, booking_page_id, service_id)
  select p_tenant, p_booking_page, sid
  from unnest(coalesce(p_service_ids, '{}'::uuid[])) as sid
  on conflict do nothing;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'booking_page.updated', 'booking_page', p_booking_page::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Booking notifications helper
-- ---------------------------------------------------------------------------

create or replace function public.notify_booking_users(
  p_tenant uuid,
  p_type text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid,
  p_appointment uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in
    select distinct recipient.user_id
    from (
      select m.user_id
      from public.business_members m
      where m.tenant_id = p_tenant
        and m.status = 'active'
        and m.role in ('owner', 'admin', 'manager')

      union

      select r.member_user_id
      from public.appointments a
      join public.booking_resources r
        on r.id = a.resource_id and r.tenant_id = a.tenant_id
      where a.id = p_appointment and a.tenant_id = p_tenant
        and r.member_user_id is not null

      union

      select c.assigned_to
      from public.appointments a
      join public.contacts c
        on c.id = a.contact_id and c.tenant_id = a.tenant_id
      where a.id = p_appointment and a.tenant_id = p_tenant
        and c.assigned_to is not null
    ) as recipient
    where recipient.user_id is not null
      and (recipient.user_id <> (select auth.uid()) or (select auth.uid()) is null)
  loop
    insert into public.notifications (
      tenant_id, user_id, notification_type, title, body,
      entity_type, entity_id, delivery_channel, delivery_status
    ) values (
      p_tenant, v_user, p_type, p_title, p_body,
      p_entity_type, p_entity_id, 'in_app', 'sent'
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Staff appointment RPCs
-- ---------------------------------------------------------------------------

create or replace function public.booking_dashboard_metrics(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    return '{}'::jsonb;
  end if;

  select jsonb_build_object(
    'today_count', count(*) filter (
      where start_at >= now() and start_at < now() + interval '1 day'
        and status not in ('cancelled', 'no_show')),
    'upcoming_count', count(*) filter (
      where start_at >= now() and status in ('pending', 'scheduled', 'confirmed')),
    'pending_count', count(*) filter (where status = 'pending'),
    'completed_count', count(*) filter (where status = 'completed'),
    'cancelled_count', count(*) filter (where status = 'cancelled'),
    'no_show_count', count(*) filter (where status = 'no_show'),
    'week_count', count(*) filter (
      where start_at >= now() and start_at < now() + interval '7 days'
        and status not in ('cancelled', 'no_show'))
  ) into v_result
  from public.appointments
  where tenant_id = p_tenant;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

create or replace function public.booking_set_status(
  p_tenant uuid,
  p_appointment uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt public.appointments%rowtype;
  v_valid boolean;
  v_old text;
  v_event text;
  v_title text;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to manage appointments for this business';
  end if;
  if p_status not in ('confirmed', 'completed', 'cancelled', 'no_show', 'scheduled') then
    raise exception 'Invalid appointment status';
  end if;

  select * into v_appt
  from public.appointments
  where id = p_appointment and tenant_id = p_tenant
  for update;
  if not found then
    raise exception 'Appointment not found';
  end if;

  v_valid := case
    when v_appt.status = 'pending' and p_status in ('confirmed', 'cancelled', 'scheduled') then true
    when v_appt.status = 'scheduled' and p_status in ('confirmed', 'completed', 'cancelled', 'no_show') then true
    when v_appt.status = 'confirmed' and p_status in ('completed', 'cancelled', 'no_show') then true
    else false
  end;
  if not v_valid then
    raise exception 'Invalid status transition from % to %', v_appt.status, p_status;
  end if;

  v_old := v_appt.status;
  update public.appointments
  set status = p_status,
      confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
      completed_at = case when p_status = 'completed' then now() else completed_at end,
      cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
      cancellation_reason = case when p_status = 'cancelled' then p_reason else cancellation_reason end
  where id = p_appointment and tenant_id = p_tenant;

  v_event := case p_status
    when 'confirmed' then 'confirmed'
    when 'cancelled' then 'cancelled'
    when 'completed' then 'completed'
    when 'no_show' then 'no_show'
    else 'status_changed'
  end;
  insert into public.appointment_events (
    tenant_id, appointment_id, event_type, from_status, to_status,
    actor_id, actor_type, metadata
  ) values (
    p_tenant, p_appointment, v_event, v_old, p_status,
    (select auth.uid()), 'staff',
    jsonb_build_object('reason', p_reason)
  );

  v_title := case p_status
    when 'confirmed' then 'Appointment confirmed'
    when 'cancelled' then 'Appointment cancelled'
    when 'completed' then 'Appointment completed'
    when 'no_show' then 'Appointment marked as no-show'
    else 'Appointment status changed'
  end;
  perform public.notify_booking_users(
    p_tenant, case p_status
      when 'confirmed' then 'appointment_confirmed'
      when 'cancelled' then 'appointment_cancelled'
      else 'appointment_rescheduled'
    end, v_title, coalesce(p_reason, ''), 'appointment', p_appointment, p_appointment
  );

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, (select auth.uid()), 'appointment.status_changed', 'appointment', p_appointment::text,
          jsonb_build_object('from', v_old, 'to', p_status));
end;
$$;

create or replace function public.booking_reschedule(
  p_tenant uuid,
  p_appointment uuid,
  p_start_at timestamptz,
  p_resource_id uuid default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt public.appointments%rowtype;
  v_service public.services%rowtype;
  v_page public.booking_pages%rowtype;
  v_tz text;
  v_date date;
  v_slots jsonb;
  v_chosen uuid;
  v_end timestamptz;
  v_total integer;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to manage appointments for this business';
  end if;

  select * into v_appt from public.appointments
  where id = p_appointment and tenant_id = p_tenant for update;
  if not found then
    raise exception 'Appointment not found';
  end if;
  if v_appt.status in ('cancelled', 'completed', 'no_show') then
    raise exception 'This appointment can no longer be rescheduled';
  end if;
  if p_start_at is null then
    raise exception 'A new start time is required';
  end if;

  select * into v_service from public.services
  where id = v_appt.service_id and tenant_id = p_tenant;
  if not found then
    raise exception 'Service for this appointment no longer exists';
  end if;
  select * into v_page from public.booking_pages
  where id = coalesce(v_appt.booking_page_id, (select id from public.booking_pages where tenant_id = p_tenant limit 1))
    and tenant_id = p_tenant;
  if not found then
    select * into v_page from public.booking_pages where tenant_id = p_tenant limit 1;
  end if;

  select coalesce(b.timezone, 'Asia/Kolkata') into v_tz
  from public.businesses b where b.id = p_tenant;
  v_date := (p_start_at at time zone v_tz)::date;

  perform pg_advisory_xact_lock(
    hashtextextended(p_tenant::text || ':' || coalesce(p_resource_id, v_appt.resource_id, '00000000-0000-0000-0000-000000000000')::text || ':' || v_date::text, 0)
  );

  v_slots := public.booking_compute_slots(
    p_tenant, v_service.id,
    coalesce(p_resource_id, v_appt.resource_id),
    v_date,
    coalesce(v_page.slot_interval_minutes, 15),
    coalesce(v_page.lead_time_minutes, 0),
    p_appointment
  );

  select value->>'resource_id' into v_chosen
  from jsonb_array_elements(v_slots) as s(value)
  where (value->>'start')::timestamptz = p_start_at
  limit 1;
  if v_chosen is null then
    raise exception 'The selected time is no longer available';
  end if;

  v_total := v_service.duration_minutes + v_service.buffer_before_minutes + v_service.buffer_after_minutes;
  v_end := p_start_at + (v_total || ' minutes')::interval;

  update public.appointments
  set start_at = p_start_at, end_at = v_end,
      resource_id = coalesce(p_resource_id, v_chosen::uuid),
      status = case when status = 'confirmed' then 'pending' else status end
  where id = p_appointment and tenant_id = p_tenant;

  insert into public.appointment_events (
    tenant_id, appointment_id, event_type, from_status, to_status,
    actor_id, actor_type, metadata
  ) values (
    p_tenant, p_appointment, 'rescheduled', v_appt.status, null,
    (select auth.uid()), 'staff',
    jsonb_build_object('reason', p_reason, 'start_at', p_start_at)
  );

  perform public.notify_booking_users(
    p_tenant, 'appointment_rescheduled', 'Appointment rescheduled',
    coalesce(p_reason, ''), 'appointment', p_appointment, p_appointment
  );
  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, (select auth.uid()), 'appointment.rescheduled', 'appointment', p_appointment::text,
          jsonb_build_object('start_at', p_start_at));
end;
$$;

create or replace function public.booking_assign(
  p_tenant uuid,
  p_appointment uuid,
  p_resource_id uuid,
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to manage appointments for this business';
  end if;
  if not exists (select 1 from public.appointments where id = p_appointment and tenant_id = p_tenant) then
    raise exception 'Appointment not found';
  end if;
  if p_resource_id is not null and not exists (
    select 1 from public.booking_resources where id = p_resource_id and tenant_id = p_tenant
  ) then
    raise exception 'Resource not found';
  end if;
  if p_user_id is not null and not public.is_active_member(p_tenant, p_user_id) then
    raise exception 'Assignee must be an active member of this business';
  end if;

  update public.appointments
  set resource_id = p_resource_id, assigned_to = p_user_id
  where id = p_appointment and tenant_id = p_tenant;

  insert into public.appointment_events (
    tenant_id, appointment_id, event_type, actor_id, actor_type, metadata
  ) values (
    p_tenant, p_appointment, 'assigned', (select auth.uid()), 'staff',
    jsonb_build_object('resource_id', p_resource_id, 'user_id', p_user_id)
  );

  if p_user_id is not null then
    insert into public.notifications (
      tenant_id, user_id, notification_type, title, entity_type, entity_id
    ) values (
      p_tenant, p_user_id, 'appointment_new', 'An appointment was assigned to you',
      'appointment', p_appointment
    );
  end if;
end;
$$;

create or replace function public.booking_create_staff(
  p_tenant uuid,
  p_service_id uuid,
  p_customer_name text,
  p_start_at timestamptz,
  p_resource_id uuid default null,
  p_contact_id uuid default null,
  p_customer_phone text default null,
  p_customer_email text default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service public.services%rowtype;
  v_page public.booking_pages%rowtype;
  v_tz text;
  v_date date;
  v_slots jsonb;
  v_chosen uuid;
  v_end timestamptz;
  v_total integer;
  v_id uuid;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to create appointments for this business';
  end if;
  if p_customer_name is null or length(trim(p_customer_name)) < 2 then
    raise exception 'Customer name is required';
  end if;
  if p_start_at is null then
    raise exception 'A start time is required';
  end if;
  if p_contact_id is not null and not exists (
    select 1 from public.contacts where id = p_contact_id and tenant_id = p_tenant
  ) then
    raise exception 'Contact not found';
  end if;

  select * into v_service from public.services
  where id = p_service_id and tenant_id = p_tenant and active = true;
  if not found then
    raise exception 'Service not found';
  end if;
  select * into v_page from public.booking_pages where tenant_id = p_tenant limit 1;

  select coalesce(b.timezone, 'Asia/Kolkata') into v_tz
  from public.businesses b where b.id = p_tenant;
  v_date := (p_start_at at time zone v_tz)::date;

  perform pg_advisory_xact_lock(
    hashtextextended(p_tenant::text || ':' || coalesce(p_resource_id, '00000000-0000-0000-0000-000000000000')::text || ':' || v_date::text, 0)
  );

  v_slots := public.booking_compute_slots(
    p_tenant, v_service.id, p_resource_id, v_date,
    coalesce(v_page.slot_interval_minutes, 15),
    coalesce(v_page.lead_time_minutes, 0), null
  );

  select value->>'resource_id' into v_chosen
  from jsonb_array_elements(v_slots) as s(value)
  where (value->>'start')::timestamptz = p_start_at
  limit 1;
  if v_chosen is null then
    raise exception 'The selected time is not available';
  end if;

  v_total := v_service.duration_minutes + v_service.buffer_before_minutes + v_service.buffer_after_minutes;
  v_end := p_start_at + (v_total || ' minutes')::interval;

  insert into public.appointments (
    tenant_id, service_id, resource_id, booking_page_id, contact_id, title,
    customer_name, customer_phone, customer_email, booking_source, notes,
    start_at, end_at, status, assigned_to, idempotency_key,
    manage_token, metadata
  ) values (
    p_tenant, v_service.id, coalesce(p_resource_id, v_chosen::uuid), v_page.id, p_contact_id,
    v_service.name, trim(p_customer_name), p_customer_phone, p_customer_email,
    'staff', p_notes, p_start_at, v_end, 'confirmed', (select auth.uid()),
    p_idempotency_key, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    jsonb_build_object('duration_minutes', v_service.duration_minutes)
  ) returning id into v_id;

  insert into public.appointment_events (
    tenant_id, appointment_id, event_type, to_status, actor_id, actor_type, metadata
  ) values (
    p_tenant, v_id, 'created', 'confirmed', (select auth.uid()), 'staff',
    jsonb_build_object('source', 'staff')
  );

  perform public.notify_booking_users(
    p_tenant, 'appointment_new', 'New appointment booked',
    trim(p_customer_name) || ' · ' || v_service.name,
    'appointment', v_id, v_id
  );
  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'appointment.created', 'appointment', v_id::text);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Public (anonymous, slug/token-scoped) booking RPCs
-- ---------------------------------------------------------------------------

create or replace function public.public_booking_get_page(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page public.booking_pages%rowtype;
  v_business public.businesses%rowtype;
  v_services jsonb;
begin
  select * into v_page from public.booking_pages
  where slug = p_slug and active = true;
  if not found then
    return '{}'::jsonb;
  end if;
  select * into v_business from public.businesses where id = v_page.tenant_id;
  if not found or v_business.status <> 'active' then
    return '{}'::jsonb;
  end if;
  if coalesce((select enable_online_bookings from public.business_settings where tenant_id = v_page.tenant_id), true) = false then
    return '{}'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'description', s.description,
      'duration_minutes', s.duration_minutes,
      'price', s.price,
      'currency', s.currency
    ) order by s.name
  ), '[]'::jsonb) into v_services
  from public.services s
  join public.booking_page_services bps
    on bps.service_id = s.id and bps.tenant_id = s.tenant_id
  where bps.booking_page_id = v_page.id and s.active = true;

  return jsonb_build_object(
    'slug', v_page.slug,
    'business_name', v_business.name,
    'business_timezone', coalesce(v_business.timezone, 'Asia/Kolkata'),
    'currency', v_business.currency,
    'title', v_page.title,
    'description', v_page.description,
    'primary_color', v_page.primary_color,
    'logo_url', v_page.logo_url,
    'require_email', v_page.require_email,
    'require_phone', v_page.require_phone,
    'allow_cancellation', v_page.allow_cancellation,
    'allow_rescheduling', v_page.allow_rescheduling,
    'booking_horizon_days', v_page.booking_horizon_days,
    'lead_time_minutes', v_page.lead_time_minutes,
    'services', v_services
  );
end;
$$;

create or replace function public.public_booking_get_slots(
  p_slug text,
  p_service_id uuid,
  p_date date,
  p_resource_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page public.booking_pages%rowtype;
  v_business public.businesses%rowtype;
  v_valid_service boolean;
begin
  select * into v_page from public.booking_pages
  where slug = p_slug and active = true;
  if not found then
    return '[]'::jsonb;
  end if;
  select * into v_business from public.businesses
  where id = v_page.tenant_id and status = 'active';
  if not found then
    return '[]'::jsonb;
  end if;

  select exists (
    select 1 from public.booking_page_services bps
    join public.services s on s.id = bps.service_id and s.tenant_id = bps.tenant_id
    where bps.booking_page_id = v_page.id
      and bps.tenant_id = v_page.tenant_id
      and bps.service_id = p_service_id
      and s.active = true
  ) into v_valid_service;
  if not v_valid_service then
    return '[]'::jsonb;
  end if;

  if p_resource_id is not null and not exists (
    select 1 from public.booking_resources
    where id = p_resource_id and tenant_id = v_page.tenant_id and active = true
  ) then
    return '[]'::jsonb;
  end if;

  if p_date < (now() at time zone coalesce(v_business.timezone, 'Asia/Kolkata'))::date
     or p_date > ((now() at time zone coalesce(v_business.timezone, 'Asia/Kolkata'))::date
                  + v_page.booking_horizon_days) then
    return '[]'::jsonb;
  end if;

  return public.booking_compute_slots(
    v_page.tenant_id, p_service_id, p_resource_id, p_date,
    v_page.slot_interval_minutes, v_page.lead_time_minutes, null
  );
end;
$$;

create or replace function public.public_booking_create(
  p_slug text,
  p_service_id uuid,
  p_start_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_resource_id uuid default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_page public.booking_pages%rowtype;
  v_business public.businesses%rowtype;
  v_service public.services%rowtype;
  v_tz text;
  v_date date;
  v_slots jsonb;
  v_chosen uuid;
  v_end timestamptz;
  v_total integer;
  v_contact uuid;
  v_first text;
  v_last text;
  v_existing uuid;
  v_recent integer;
  v_id uuid;
  v_token text;
begin
  select * into v_page from public.booking_pages where slug = p_slug and active = true;
  if not found then
    raise exception 'Booking page not found';
  end if;
  select * into v_business from public.businesses
  where id = v_page.tenant_id and status = 'active';
  if not found then
    raise exception 'Booking page not found';
  end if;
  if coalesce((select enable_online_bookings from public.business_settings where tenant_id = v_page.tenant_id), true) = false then
    raise exception 'Online bookings are disabled for this business';
  end if;

  select * into v_service from public.services s
  where s.id = p_service_id and s.tenant_id = v_page.tenant_id and s.active = true
    and exists (
      select 1 from public.booking_page_services bps
      where bps.booking_page_id = v_page.id
        and bps.tenant_id = v_page.tenant_id
        and bps.service_id = s.id
    );
  if not found then
    raise exception 'This service is not bookable on this page';
  end if;

  if p_customer_name is null or length(trim(p_customer_name)) < 2 or length(p_customer_name) > 160 then
    raise exception 'Please enter your name';
  end if;
  if v_page.require_phone and (p_customer_phone is null or length(trim(p_customer_phone)) < 7) then
    raise exception 'A valid phone number is required';
  end if;
  if v_page.require_email and (p_customer_email is null or p_customer_email not like '%@%') then
    raise exception 'A valid email address is required';
  end if;
  if p_start_at is null then
    raise exception 'Please select a time';
  end if;

  v_tz := coalesce(v_business.timezone, 'Asia/Kolkata');
  v_date := (p_start_at at time zone v_tz)::date;

  if p_idempotency_key is not null and length(p_idempotency_key) > 200 then
    raise exception 'Invalid request';
  end if;
  if p_idempotency_key is not null then
    select id, manage_token into v_existing, v_token
    from public.appointments
    where tenant_id = v_page.tenant_id and idempotency_key = p_idempotency_key
    limit 1;
    if v_existing is not null then
      return jsonb_build_object(
        'id', v_existing, 'manage_token', v_token, 'status', 'existing'
      );
    end if;
  end if;

  -- Coarse anonymous abuse control: repeated submissions from one phone.
  if p_customer_phone is not null then
    select count(*) into v_recent
    from public.appointments
    where tenant_id = v_page.tenant_id
      and customer_phone = p_customer_phone
      and created_at > now() - interval '5 minutes';
    if v_recent >= 3 then
      raise exception 'Too many booking attempts. Please try again shortly.';
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_page.tenant_id::text || ':' || coalesce(p_resource_id, '00000000-0000-0000-0000-000000000000')::text || ':' || v_date::text, 0)
  );

  v_slots := public.booking_compute_slots(
    v_page.tenant_id, v_service.id, p_resource_id, v_date,
    v_page.slot_interval_minutes, v_page.lead_time_minutes, null
  );

  select value->>'resource_id' into v_chosen
  from jsonb_array_elements(v_slots) as s(value)
  where (value->>'start')::timestamptz = p_start_at
  limit 1;
  if v_chosen is null then
    raise exception 'That time is no longer available. Please choose another slot.';
  end if;

  v_total := v_service.duration_minutes + v_service.buffer_before_minutes + v_service.buffer_after_minutes;
  v_end := p_start_at + (v_total || ' minutes')::interval;

  -- Connect to an existing CRM contact by phone/email or create a new lead.
  select id into v_contact
  from public.contacts
  where tenant_id = v_page.tenant_id
    and (
      (p_customer_phone is not null and phone is not null
       and regexp_replace(phone, '\D', '', 'g') = regexp_replace(p_customer_phone, '\D', '', 'g'))
      or (p_customer_email is not null and email is not null and lower(email) = lower(p_customer_email))
    )
  order by created_at
  limit 1;

  if v_contact is null then
    v_first := split_part(trim(p_customer_name), ' ', 1);
    v_last := nullif(trim(substring(trim(p_customer_name) from position(' ' in trim(p_customer_name)) + 1)), '');
    insert into public.contacts (tenant_id, first_name, last_name, phone, email, source, lead_status)
    values (v_page.tenant_id, v_first, v_last, p_customer_phone, p_customer_email, 'booking_page', 'new')
    returning id into v_contact;
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.appointments (
    tenant_id, service_id, resource_id, booking_page_id, contact_id, title,
    customer_name, customer_phone, customer_email, booking_source, notes,
    start_at, end_at, status, idempotency_key, manage_token, metadata
  ) values (
    v_page.tenant_id, v_service.id, v_chosen::uuid, v_page.id, v_contact, v_service.name,
    trim(p_customer_name), p_customer_phone, p_customer_email, 'public_booking', p_notes,
    p_start_at, v_end, 'pending', p_idempotency_key, v_token,
    jsonb_build_object('duration_minutes', v_service.duration_minutes)
  ) returning id into v_id;

  insert into public.appointment_events (
    tenant_id, appointment_id, event_type, to_status, actor_type, metadata
  ) values (
    v_page.tenant_id, v_id, 'created', 'pending', 'customer',
    jsonb_build_object('source', 'public_booking')
  );

  perform public.notify_booking_users(
    v_page.tenant_id, 'appointment_new', 'New online booking',
    trim(p_customer_name) || ' · ' || v_service.name,
    'appointment', v_id, v_id
  );

  return jsonb_build_object(
    'id', v_id,
    'manage_token', v_token,
    'status', 'pending',
    'start_at', to_jsonb(p_start_at),
    'end_at', to_jsonb(v_end),
    'service_name', v_service.name,
    'customer_name', trim(p_customer_name)
  );
end;
$$;

create or replace function public.public_booking_manage(
  p_token text,
  p_action text,
  p_start_at timestamptz default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt public.appointments%rowtype;
  v_page public.booking_pages%rowtype;
  v_service public.services%rowtype;
  v_tz text;
  v_date date;
  v_slots jsonb;
  v_chosen uuid;
  v_end timestamptz;
  v_total integer;
begin
  select * into v_appt from public.appointments
  where manage_token = p_token for update;
  if not found then
    raise exception 'Booking not found';
  end if;
  if p_action not in ('cancel', 'reschedule') then
    raise exception 'Invalid action';
  end if;
  if v_appt.status in ('cancelled', 'completed', 'no_show') then
    raise exception 'This booking can no longer be changed';
  end if;

  select * into v_page from public.booking_pages
  where id = v_appt.booking_page_id and tenant_id = v_appt.tenant_id;
  if not found then
    raise exception 'Booking not found';
  end if;
  if p_action = 'cancel' and not v_page.allow_cancellation then
    raise exception 'Online cancellation is not available for this booking';
  end if;
  if p_action = 'reschedule' and not v_page.allow_rescheduling then
    raise exception 'Online rescheduling is not available for this booking';
  end if;
  if v_appt.start_at < now() + (v_page.cancellation_hours || ' hours')::interval then
    raise exception 'This booking is too soon to change online. Please contact the business.';
  end if;

  if p_action = 'cancel' then
    update public.appointments
    set status = 'cancelled', cancelled_at = now(), cancellation_reason = p_reason
    where id = v_appt.id and tenant_id = v_appt.tenant_id;

    insert into public.appointment_events (
      tenant_id, appointment_id, event_type, from_status, to_status, actor_type, metadata
    ) values (
      v_appt.tenant_id, v_appt.id, 'cancelled', v_appt.status, 'cancelled', 'customer',
      jsonb_build_object('reason', p_reason)
    );

    perform public.notify_booking_users(
      v_appt.tenant_id, 'appointment_cancelled', 'Online booking cancelled',
      coalesce(v_appt.customer_name, ''), 'appointment', v_appt.id, v_appt.id
    );
    return jsonb_build_object('id', v_appt.id, 'status', 'cancelled');
  end if;

  if p_start_at is null then
    raise exception 'A new start time is required';
  end if;
  select * into v_service from public.services
  where id = v_appt.service_id and tenant_id = v_appt.tenant_id;
  select coalesce(b.timezone, 'Asia/Kolkata') into v_tz
  from public.businesses b where b.id = v_appt.tenant_id;
  v_date := (p_start_at at time zone v_tz)::date;

  perform pg_advisory_xact_lock(
    hashtextextended(v_appt.tenant_id::text || ':' || coalesce(v_appt.resource_id, '00000000-0000-0000-0000-000000000000')::text || ':' || v_date::text, 0)
  );

  v_slots := public.booking_compute_slots(
    v_appt.tenant_id, v_service.id, v_appt.resource_id, v_date,
    v_page.slot_interval_minutes, v_page.lead_time_minutes, v_appt.id
  );

  select value->>'resource_id' into v_chosen
  from jsonb_array_elements(v_slots) as s(value)
  where (value->>'start')::timestamptz = p_start_at
  limit 1;
  if v_chosen is null then
    raise exception 'That time is no longer available';
  end if;

  v_total := v_service.duration_minutes + v_service.buffer_before_minutes + v_service.buffer_after_minutes;
  v_end := p_start_at + (v_total || ' minutes')::interval;

  update public.appointments
  set start_at = p_start_at, end_at = v_end,
      resource_id = v_chosen::uuid, status = 'pending'
  where id = v_appt.id and tenant_id = v_appt.tenant_id;

  insert into public.appointment_events (
    tenant_id, appointment_id, event_type, from_status, to_status, actor_type, metadata
  ) values (
    v_appt.tenant_id, v_appt.id, 'rescheduled', v_appt.status, 'pending', 'customer',
    jsonb_build_object('reason', p_reason, 'start_at', p_start_at)
  );

  perform public.notify_booking_users(
    v_appt.tenant_id, 'appointment_rescheduled', 'Online booking rescheduled',
    coalesce(v_appt.customer_name, ''), 'appointment', v_appt.id, v_appt.id
  );
  return jsonb_build_object('id', v_appt.id, 'status', 'pending', 'start_at', to_jsonb(p_start_at));
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Communication foundation RPCs
-- ---------------------------------------------------------------------------

create or replace function public.inbox_create_conversation(
  p_tenant uuid,
  p_contact_id uuid default null,
  p_channel_id uuid default null,
  p_subject text default null,
  p_customer_name text default null,
  p_customer_email text default null,
  p_assigned_to uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_internal uuid;
  v_channel_type text := 'internal';
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to create conversations for this business';
  end if;
  if p_contact_id is not null and not exists (
    select 1 from public.contacts where id = p_contact_id and tenant_id = p_tenant
  ) then
    raise exception 'Contact not found';
  end if;
  if p_channel_id is not null and not exists (
    select 1 from public.channels where id = p_channel_id and tenant_id = p_tenant and active = true
  ) then
    raise exception 'Channel not found';
  end if;
  if p_assigned_to is not null and not public.is_active_member(p_tenant, p_assigned_to) then
    raise exception 'Assignee must be an active member of this business';
  end if;

  if p_channel_id is null then
    select id, channel_type into v_internal, v_channel_type
    from public.channels
    where tenant_id = p_tenant and channel_type = 'internal' and active = true
    order by created_at
    limit 1;
  else
    select channel_type into v_channel_type
    from public.channels
    where id = p_channel_id and tenant_id = p_tenant and active = true;
  end if;

  -- `channel` is a legacy NOT NULL text column from migration 0001.
  insert into public.conversations (
    tenant_id, contact_id, channel_id, channel, subject, customer_name,
    customer_email, status, priority, assigned_to, last_message_at
  ) values (
    p_tenant, p_contact_id, coalesce(p_channel_id, v_internal),
    coalesce(v_channel_type, 'internal'), p_subject,
    p_customer_name, p_customer_email, 'open', 'normal', p_assigned_to, now()
  ) returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'conversation.created', 'conversation', v_id::text);

  if p_assigned_to is not null then
    insert into public.notifications (
      tenant_id, user_id, notification_type, title, entity_type, entity_id
    ) values (
      p_tenant, p_assigned_to, 'conversation_assigned',
      'A conversation was assigned to you', 'conversation', v_id
    );
  end if;
  return v_id;
end;
$$;

create or replace function public.inbox_assign_conversation(
  p_tenant uuid,
  p_conversation uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to manage conversations for this business';
  end if;
  if not exists (select 1 from public.conversations where id = p_conversation and tenant_id = p_tenant) then
    raise exception 'Conversation not found';
  end if;
  if p_user_id is not null and not public.is_active_member(p_tenant, p_user_id) then
    raise exception 'Assignee must be an active member of this business';
  end if;

  update public.conversations set assigned_to = p_user_id
  where id = p_conversation and tenant_id = p_tenant;

  if p_user_id is not null then
    insert into public.notifications (
      tenant_id, user_id, notification_type, title, entity_type, entity_id
    ) values (
      p_tenant, p_user_id, 'conversation_assigned',
      'A conversation was assigned to you', 'conversation', p_conversation
    );
  end if;
end;
$$;

create or replace function public.inbox_set_conversation_status(
  p_tenant uuid,
  p_conversation uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to manage conversations for this business';
  end if;
  if p_status not in ('open', 'pending', 'closed') then
    raise exception 'Invalid conversation status';
  end if;
  update public.conversations set status = p_status
  where id = p_conversation and tenant_id = p_tenant;
  if not found then
    raise exception 'Conversation not found';
  end if;
end;
$$;

create or replace function public.inbox_send_message(
  p_tenant uuid,
  p_conversation uuid,
  p_content text,
  p_message_type text default 'text',
  p_is_internal boolean default false,
  p_external_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_channel text;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to send messages for this business';
  end if;
  if p_content is null or length(trim(p_content)) = 0 or length(p_content) > 10000 then
    raise exception 'Message must be between 1 and 10000 characters';
  end if;
  if p_message_type not in ('text', 'image', 'file', 'system', 'email', 'whatsapp') then
    raise exception 'Invalid message type';
  end if;

  select c.channel_type into v_channel
  from public.conversations conv
  left join public.channels c on c.id = conv.channel_id and c.tenant_id = conv.tenant_id
  where conv.id = p_conversation and conv.tenant_id = p_tenant;
  if not found then
    raise exception 'Conversation not found';
  end if;

  if p_external_id is not null and exists (
    select 1 from public.messages
    where tenant_id = p_tenant and provider_message_id = p_external_id
  ) then
    raise exception 'Duplicate provider message id';
  end if;

  insert into public.messages (
    tenant_id, conversation_id, direction, message_type, content,
    provider_message_id, delivery_status, author_id, author_type,
    is_internal, delivered_at, metadata
  ) values (
    p_tenant, p_conversation, 'outbound', p_message_type, trim(p_content),
    p_external_id, case when p_is_internal then 'sent' else 'pending' end,
    (select auth.uid()), 'staff', p_is_internal,
    case when p_is_internal then now() else null end, '{}'::jsonb
  ) returning id into v_id;

  update public.conversations
  set last_message_at = now(),
      status = case when status = 'closed' then 'open' else status end
  where id = p_conversation and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, (select auth.uid()), 'message.sent', 'message', v_id::text,
          jsonb_build_object('internal', p_is_internal, 'channel', v_channel));
  return v_id;
end;
$$;

create or replace function public.inbox_mark_read(
  p_tenant uuid,
  p_conversation uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to manage conversations for this business';
  end if;
  update public.messages
  set read_at = now()
  where tenant_id = p_tenant
    and conversation_id = p_conversation
    and direction = 'inbound'
    and read_at is null;
  update public.conversations
  set unread_count = 0
  where id = p_conversation and tenant_id = p_tenant;
end;
$$;

create or replace function public.inbox_metrics(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    return '{}'::jsonb;
  end if;
  select jsonb_build_object(
    'open_count', count(*) filter (where status = 'open'),
    'pending_count', count(*) filter (where status = 'pending'),
    'closed_count', count(*) filter (where status = 'closed'),
    'unassigned_count', count(*) filter (where assigned_to is null)
  ) into v_result
  from public.conversations
  where tenant_id = p_tenant;
  return coalesce(v_result, '{}'::jsonb);
end;
$$;

-- Edge Functions use the service role to record provider webhooks directly;
-- this helper is for owner/admin-initiated manual reconciliation only.
create or replace function public.inbox_record_webhook(
  p_tenant uuid,
  p_provider text,
  p_event_type text,
  p_external_id text,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted boolean := false;
begin
  if (select auth.uid()) is null
     or not public.has_tenant_role(p_tenant, array['owner', 'admin']) then
    raise exception 'Not allowed to record webhook events';
  end if;
  insert into public.webhook_events (
    tenant_id, provider, event_type, external_id, payload, status, processed_at
  ) values (
    p_tenant, p_provider, p_event_type, p_external_id,
    coalesce(p_payload, '{}'::jsonb), 'processed', now()
  )
  on conflict (provider, external_id) do nothing;
  v_inserted := found;
  return v_inserted;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Notification RPCs
-- ---------------------------------------------------------------------------

create or replace function public.notifications_list(
  p_tenant uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_total integer;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    return '{"items": [], "total_count": 0}'::jsonb;
  end if;
  select count(*) into v_total
  from public.notifications
  where tenant_id = p_tenant and user_id = (select auth.uid());

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', n.id,
      'notification_type', n.notification_type,
      'title', n.title,
      'body', n.body,
      'entity_type', n.entity_type,
      'entity_id', n.entity_id,
      'read_at', n.read_at,
      'created_at', n.created_at
    ) order by n.created_at desc
  ), '[]'::jsonb) into v_result
  from (
    select * from public.notifications
    where tenant_id = p_tenant and user_id = (select auth.uid())
    order by created_at desc
    limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
  ) n;

  return jsonb_build_object('items', coalesce(v_result, '[]'::jsonb), 'total_count', v_total);
end;
$$;

create or replace function public.notifications_mark_read(
  p_tenant uuid,
  p_notification uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to update notifications';
  end if;
  update public.notifications
  set read_at = now()
  where id = p_notification
    and tenant_id = p_tenant
    and user_id = (select auth.uid())
    and read_at is null;
end;
$$;

create or replace function public.notifications_mark_all_read(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to update notifications';
  end if;
  update public.notifications
  set read_at = now()
  where tenant_id = p_tenant
    and user_id = (select auth.uid())
    and read_at is null;
end;
$$;

create or replace function public.notifications_unread_count(p_tenant uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.notifications
  where tenant_id = p_tenant
    and user_id = (select auth.uid())
    and read_at is null;
$$;

-- ---------------------------------------------------------------------------
-- 13. Function grants
-- ---------------------------------------------------------------------------

revoke all on function public.can_manage_bookings(uuid) from public;
revoke all on function public.seed_booking_defaults() from public;
revoke all on function public.booking_compute_slots(uuid, uuid, uuid, date, integer, integer, uuid) from public;
revoke all on function public.booking_create_service(uuid, text, text, integer, numeric, text, integer, integer, boolean) from public;
revoke all on function public.booking_update_service(uuid, uuid, text, text, integer, numeric, text, integer, integer, boolean) from public;
revoke all on function public.booking_set_service_active(uuid, uuid, boolean) from public;
revoke all on function public.booking_create_resource(uuid, text, text, uuid, text, boolean) from public;
revoke all on function public.booking_update_resource(uuid, uuid, text, text, uuid, text, boolean) from public;
revoke all on function public.booking_set_service_resources(uuid, uuid, uuid[]) from public;
revoke all on function public.booking_upsert_availability_rule(uuid, uuid, uuid, smallint, time, time, boolean, date, date) from public;
revoke all on function public.booking_delete_availability_rule(uuid, uuid) from public;
revoke all on function public.booking_create_exception(uuid, uuid, text, text, timestamptz, timestamptz, boolean) from public;
revoke all on function public.booking_delete_exception(uuid, uuid) from public;
revoke all on function public.booking_update_page_settings(uuid, uuid, text, text, text, text, integer, integer, integer, boolean, boolean, boolean, boolean, integer, boolean, uuid[]) from public;
revoke all on function public.notify_booking_users(uuid, text, text, text, text, uuid, uuid) from public;
revoke all on function public.booking_dashboard_metrics(uuid) from public;
revoke all on function public.booking_set_status(uuid, uuid, text, text) from public;
revoke all on function public.booking_reschedule(uuid, uuid, timestamptz, uuid, text) from public;
revoke all on function public.booking_assign(uuid, uuid, uuid, uuid) from public;
revoke all on function public.booking_create_staff(uuid, uuid, text, timestamptz, uuid, uuid, text, text, text, text) from public;
revoke all on function public.inbox_create_conversation(uuid, uuid, uuid, text, text, text, uuid) from public;
revoke all on function public.inbox_assign_conversation(uuid, uuid, uuid) from public;
revoke all on function public.inbox_set_conversation_status(uuid, uuid, text) from public;
revoke all on function public.inbox_send_message(uuid, uuid, text, text, boolean, text) from public;
revoke all on function public.inbox_mark_read(uuid, uuid) from public;
revoke all on function public.inbox_metrics(uuid) from public;
revoke all on function public.inbox_record_webhook(uuid, text, text, text, jsonb) from public;
revoke all on function public.notifications_list(uuid, integer, integer) from public;
revoke all on function public.notifications_mark_read(uuid, uuid) from public;
revoke all on function public.notifications_mark_all_read(uuid) from public;
revoke all on function public.notifications_unread_count(uuid) from public;
revoke all on function public.public_booking_get_page(text) from public;
revoke all on function public.public_booking_get_slots(text, uuid, date, uuid) from public;
revoke all on function public.public_booking_create(text, uuid, timestamptz, text, text, text, uuid, text, text) from public;
revoke all on function public.public_booking_manage(text, text, timestamptz, text) from public;

grant execute on function public.can_manage_bookings(uuid) to authenticated;
grant execute on function public.booking_create_service(uuid, text, text, integer, numeric, text, integer, integer, boolean) to authenticated;
grant execute on function public.booking_update_service(uuid, uuid, text, text, integer, numeric, text, integer, integer, boolean) to authenticated;
grant execute on function public.booking_set_service_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.booking_create_resource(uuid, text, text, uuid, text, boolean) to authenticated;
grant execute on function public.booking_update_resource(uuid, uuid, text, text, uuid, text, boolean) to authenticated;
grant execute on function public.booking_set_service_resources(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.booking_upsert_availability_rule(uuid, uuid, uuid, smallint, time, time, boolean, date, date) to authenticated;
grant execute on function public.booking_delete_availability_rule(uuid, uuid) to authenticated;
grant execute on function public.booking_create_exception(uuid, uuid, text, text, timestamptz, timestamptz, boolean) to authenticated;
grant execute on function public.booking_delete_exception(uuid, uuid) to authenticated;
grant execute on function public.booking_update_page_settings(uuid, uuid, text, text, text, text, integer, integer, integer, boolean, boolean, boolean, boolean, integer, boolean, uuid[]) to authenticated;
grant execute on function public.booking_dashboard_metrics(uuid) to authenticated;
grant execute on function public.booking_set_status(uuid, uuid, text, text) to authenticated;
grant execute on function public.booking_reschedule(uuid, uuid, timestamptz, uuid, text) to authenticated;
grant execute on function public.booking_assign(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.booking_create_staff(uuid, uuid, text, timestamptz, uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.inbox_create_conversation(uuid, uuid, uuid, text, text, text, uuid) to authenticated;
grant execute on function public.inbox_assign_conversation(uuid, uuid, uuid) to authenticated;
grant execute on function public.inbox_set_conversation_status(uuid, uuid, text) to authenticated;
grant execute on function public.inbox_send_message(uuid, uuid, text, text, boolean, text) to authenticated;
grant execute on function public.inbox_mark_read(uuid, uuid) to authenticated;
grant execute on function public.inbox_metrics(uuid) to authenticated;
grant execute on function public.inbox_record_webhook(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.notifications_list(uuid, integer, integer) to authenticated;
grant execute on function public.notifications_mark_read(uuid, uuid) to authenticated;
grant execute on function public.notifications_mark_all_read(uuid) to authenticated;
grant execute on function public.notifications_unread_count(uuid) to authenticated;

-- Narrow anonymous surface: only these four slug/token-scoped functions.
grant execute on function public.public_booking_get_page(text) to anon, authenticated;
grant execute on function public.public_booking_get_slots(text, uuid, date, uuid) to anon, authenticated;
grant execute on function public.public_booking_create(text, uuid, timestamptz, text, text, text, uuid, text, text) to anon, authenticated;
grant execute on function public.public_booking_manage(text, text, timestamptz, text) to anon, authenticated;

commit;
