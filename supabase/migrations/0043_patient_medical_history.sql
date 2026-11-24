-- LOCAL ONLY — patient medical history MVP for dental clinics.
-- Contract:
--   * Adds a `doctor` tenant role (owners/admins/doctors may manage history).
--   * Append-only, dated medical-history entries linked to a contact.
--   * Direct table access is denied; all reads/writes go through security-definer RPCs.
--   * Consent is mandatory on every entry; audit logs contain metadata only.
--   * No medical values are sent to AI, WhatsApp, email, Google or public pages.
-- Hosted apply is approval-gated. Do not re-apply once hosted.

begin;

-- ---------------------------------------------------------------------------
-- 1. Doctor role
-- ---------------------------------------------------------------------------

do $$
declare
  v_name text;
begin
  select conname into v_name
  from pg_constraint
  where conrelid = 'public.business_members'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%role%';
  if v_name is not null then
    execute format('alter table public.business_members drop constraint %I', v_name);
  end if;

  select conname into v_name
  from pg_constraint
  where conrelid = 'public.business_invitations'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%role%';
  if v_name is not null then
    execute format('alter table public.business_invitations drop constraint %I', v_name);
  end if;
end $$;

alter table public.business_members
  add constraint business_members_role_check
  check (role in ('owner', 'admin', 'manager', 'doctor', 'employee'));

alter table public.business_invitations
  add constraint business_invitations_role_check
  check (role in ('admin', 'manager', 'doctor', 'employee'));

create or replace function public.protect_membership_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_platform_admin boolean := public.is_platform_admin(array['super_admin']);
  v_active_owners integer;
  v_accept_tenant text := nullif(current_setting('app.invitation_accept', true), '');
begin
  if v_accept_tenant is not null
     and tg_op <> 'DELETE'
     and new.tenant_id::text = v_accept_tenant
     and new.user_id = v_caller
     and new.role in ('admin', 'manager', 'doctor', 'employee')
     and new.status = 'active' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role = 'owner' and not v_platform_admin then
      select count(*) into v_active_owners
      from public.business_members bm
      where bm.tenant_id = new.tenant_id
        and bm.role = 'owner'
        and bm.status = 'active';
      if v_active_owners > 0 then
        raise exception 'Only one active owner is allowed per business';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if v_caller = old.user_id and not v_platform_admin
       and (new.role is distinct from old.role or new.status is distinct from old.status) then
      raise exception 'You cannot change your own role or membership status';
    end if;
    if new.role is distinct from old.role
       and (new.role = 'owner' or old.role = 'owner')
       and not v_platform_admin then
      raise exception 'Only a platform administrator can change the owner role';
    end if;
    if old.role = 'owner' and new.status <> 'active' and not v_platform_admin then
      raise exception 'Only a platform administrator can suspend an owner';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'owner' and old.status = 'active' and not v_platform_admin then
      if old.user_id = v_caller then
        raise exception 'An owner cannot remove themselves';
      end if;
      select count(*) into v_active_owners
      from public.business_members bm
      where bm.tenant_id = old.tenant_id
        and bm.role = 'owner'
        and bm.status = 'active';
      if v_active_owners <= 1 then
        raise exception 'The last active owner cannot be removed';
      end if;
    end if;
    return old;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Permission helper and append-only table
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_medical_history(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_tenant_role(p_tenant, array['owner', 'admin', 'doctor']);
$$;

revoke all on function public.can_manage_medical_history(uuid) from public, anon;
grant execute on function public.can_manage_medical_history(uuid) to authenticated;

create table if not exists public.patient_medical_history_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id) on delete set null,
  allergies text,
  conditions text,
  medications text,
  past_treatments text,
  family_history text,
  notes text,
  consent_given boolean not null default false,
  consent_version text not null default 'medical-history-v1',
  consent_given_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint patient_medical_history_entries_contact_fk
    foreign key (contact_id, tenant_id) references public.contacts(id, tenant_id) on delete cascade,
  constraint patient_medical_history_entries_consent_chk check (consent_given is true),
  constraint patient_medical_history_entries_allergies_len check (length(coalesce(allergies, '')) <= 2000),
  constraint patient_medical_history_entries_conditions_len check (length(coalesce(conditions, '')) <= 2000),
  constraint patient_medical_history_entries_medications_len check (length(coalesce(medications, '')) <= 2000),
  constraint patient_medical_history_entries_treatments_len check (length(coalesce(past_treatments, '')) <= 4000),
  constraint patient_medical_history_entries_family_len check (length(coalesce(family_history, '')) <= 2000),
  constraint patient_medical_history_entries_notes_len check (length(coalesce(notes, '')) <= 4000)
);

create index if not exists patient_medical_history_entries_tenant_contact_idx
  on public.patient_medical_history_entries (tenant_id, contact_id, recorded_at desc);

alter table public.patient_medical_history_entries enable row level security;

drop policy if exists patient_medical_history_read on public.patient_medical_history_entries;
create policy patient_medical_history_read
  on public.patient_medical_history_entries
  for select to authenticated
  using (public.can_manage_medical_history(tenant_id));

revoke all on public.patient_medical_history_entries from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Metadata-only audit trigger
-- ---------------------------------------------------------------------------

create or replace function public.patient_medical_history_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    new.tenant_id,
    (select auth.uid()),
    'patient_medical_history.created',
    'patient_medical_history',
    new.id::text,
    jsonb_build_object(
      'contact_id', new.contact_id,
      'consent_version', new.consent_version,
      'external_call', false,
      'auto_send', false,
      'ai_used', false
    )
  );
  return null;
end;
$$;

revoke all on function public.patient_medical_history_audit() from public, anon, authenticated;

drop trigger if exists patient_medical_history_audit on public.patient_medical_history_entries;
create trigger patient_medical_history_audit
  after insert on public.patient_medical_history_entries
  for each row execute function public.patient_medical_history_audit();

-- ---------------------------------------------------------------------------
-- 4. Trusted RPCs — membership recheck, consent, no client table writes
-- ---------------------------------------------------------------------------

create or replace function public.patient_medical_history_list(p_tenant uuid, p_contact uuid)
returns table (
  id uuid,
  contact_id uuid,
  recorded_at timestamptz,
  recorded_by uuid,
  allergies text,
  conditions text,
  medications text,
  past_treatments text,
  family_history text,
  notes text,
  consent_version text,
  consent_given_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_medical_history(p_tenant) then
    raise exception 'Access denied';
  end if;
  if not exists (select 1 from public.contacts c where c.id = p_contact and c.tenant_id = p_tenant) then
    raise exception 'Contact not found';
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant,
    (select auth.uid()),
    'patient_medical_history.viewed',
    'patient_medical_history',
    p_contact::text,
    jsonb_build_object('contact_id', p_contact, 'external_call', false, 'auto_send', false, 'ai_used', false)
  );

  return query
    select e.id, e.contact_id, e.recorded_at, e.recorded_by, e.allergies, e.conditions,
           e.medications, e.past_treatments, e.family_history, e.notes,
           e.consent_version, e.consent_given_at
    from public.patient_medical_history_entries e
    where e.tenant_id = p_tenant and e.contact_id = p_contact
    order by e.recorded_at desc, e.id desc;
end;
$$;

create or replace function public.patient_medical_history_add(
  p_tenant uuid,
  p_contact uuid,
  p_allergies text,
  p_conditions text,
  p_medications text,
  p_past_treatments text,
  p_family_history text,
  p_notes text,
  p_consent_given boolean,
  p_consent_version text default 'medical-history-v1'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.can_manage_medical_history(p_tenant) then
    raise exception 'Access denied';
  end if;
  if not exists (select 1 from public.contacts c where c.id = p_contact and c.tenant_id = p_tenant) then
    raise exception 'Contact not found';
  end if;
  if p_consent_given is not true then
    raise exception 'Patient consent is required';
  end if;
  if nullif(btrim(coalesce(p_consent_version, '')), '') is null then
    raise exception 'Consent version is required';
  end if;

  insert into public.patient_medical_history_entries (
    tenant_id, contact_id, recorded_by, allergies, conditions, medications,
    past_treatments, family_history, notes, consent_given, consent_version
  )
  values (
    p_tenant, p_contact, (select auth.uid()),
    nullif(btrim(coalesce(p_allergies, '')), ''),
    nullif(btrim(coalesce(p_conditions, '')), ''),
    nullif(btrim(coalesce(p_medications, '')), ''),
    nullif(btrim(coalesce(p_past_treatments, '')), ''),
    nullif(btrim(coalesce(p_family_history, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    true, btrim(p_consent_version)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.patient_medical_history_list(uuid, uuid) from public, anon;
revoke all on function public.patient_medical_history_add(uuid, uuid, text, text, text, text, text, text, boolean, text) from public, anon;
grant execute on function public.patient_medical_history_list(uuid, uuid) to authenticated;
grant execute on function public.patient_medical_history_add(uuid, uuid, text, text, text, text, text, text, boolean, text) to authenticated;

commit;
