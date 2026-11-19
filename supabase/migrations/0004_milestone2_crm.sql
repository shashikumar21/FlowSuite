-- =============================================================================
-- 0004_milestone2_crm.sql
-- Milestone 2: Core CRM
--
-- Extends (never recreates) contacts, pipelines, pipeline_stages and deals.
-- Adds tenant-owned CRM tables, granular RLS, trusted RPCs, real dashboard
-- metrics, and the three approved Milestone 1 hardening fixes.
--
-- All user-facing functions are SECURITY DEFINER with a pinned search_path and
-- re-check membership/permissions internally. RLS remains authoritative for
-- direct table access from the browser.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Authorization helpers
-- -----------------------------------------------------------------------------
create or replace function public.can_manage_crm(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_tenant_role(p_tenant, array['owner', 'admin', 'manager']);
$$;

create or replace function public.is_active_member(p_tenant uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
    and exists (
      select 1 from public.business_members bm
      where bm.tenant_id = p_tenant
        and bm.user_id = p_user
        and bm.status = 'active'
    );
$$;

-- Employees see: records assigned to them + unassigned leads they can claim.
create or replace function public.can_view_contact(p_tenant uuid, p_contact uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_tenant_access(p_tenant)
    and (
      public.can_manage_crm(p_tenant)
      or exists (
        select 1 from public.contacts c
        where c.tenant_id = p_tenant
          and c.id = p_contact
          and (
            c.assigned_to = (select auth.uid())
            or (c.assigned_to is null and c.status = 'lead')
          )
      )
    );
$$;

create or replace function public.can_edit_contact(p_tenant uuid, p_contact uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_tenant_access(p_tenant)
    and (
      public.can_manage_crm(p_tenant)
      or exists (
        select 1 from public.contacts c
        where c.tenant_id = p_tenant
          and c.id = p_contact
          and c.assigned_to = (select auth.uid())
      )
    );
$$;

create or replace function public.can_view_deal(p_tenant uuid, p_deal uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_tenant_access(p_tenant)
    and (
      public.can_manage_crm(p_tenant)
      or exists (
        select 1 from public.deals d
        where d.tenant_id = p_tenant
          and d.id = p_deal
          and d.assigned_to = (select auth.uid())
      )
    );
$$;

create or replace function public.can_edit_deal(p_tenant uuid, p_deal uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_view_deal(p_tenant, p_deal);
$$;

-- PL/pgSQL defers parsing until first call: contact_activities is created later
-- in this migration.
create or replace function public.can_view_activity(p_tenant uuid, p_activity uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return public.has_tenant_access(p_tenant)
    and (
      public.can_manage_crm(p_tenant)
      or exists (
        select 1 from public.contact_activities a
        where a.tenant_id = p_tenant
          and a.id = p_activity
          and (
            a.created_by = (select auth.uid())
            or public.can_view_contact(p_tenant, a.contact_id)
          )
      )
    );
end;
$$;

-- Validates that an assignment target is an ACTIVE member of the same tenant.
-- The composite FKs below already prevent cross-tenant targets; this closes the
-- "invited/suspended member" gap.
create or replace function public.validate_crm_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assigned_to is not null
     and not public.is_active_member(new.tenant_id, new.assigned_to) then
    raise exception 'Assigned user is not an active member of this business';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Extend existing CRM tables
-- -----------------------------------------------------------------------------
alter table public.contacts
  add column company text,
  add column notes text,
  add column lead_status text not null default 'new',
  add column lead_score integer not null default 0 check (lead_score between 0 and 100),
  add column source_id uuid,
  add column follow_up_at timestamptz,
  add column last_contacted_at timestamptz,
  add column converted_at timestamptz,
  add constraint contacts_lead_status_check
    check (lead_status in ('new', 'contacted', 'qualified', 'unqualified', 'converted'));

-- Replace the non-tenant-safe assignment FK with a composite tenant-aware FK.
alter table public.contacts drop constraint if exists contacts_assigned_to_fkey;
alter table public.contacts add constraint contacts_assigned_tenant_fkey
  foreign key (tenant_id, assigned_to)
  references public.business_members (tenant_id, user_id)
  on delete set null (assigned_to);

alter table public.pipelines
  add column description text,
  add column color text,
  add column position integer not null default 0,
  add column is_active boolean not null default true,
  add constraint pipelines_tenant_name_key unique (tenant_id, name);

alter table public.pipeline_stages
  add column is_closed boolean not null default false,
  add column is_won boolean not null default false,
  add column color text,
  add column slug text,
  add constraint pipeline_stages_tenant_pipeline_name_key unique (tenant_id, pipeline_id, name),
  add constraint pipeline_stages_tenant_pipeline_id_key unique (tenant_id, pipeline_id, id);

alter table public.deals
  add column expected_close_date date,
  add column description text,
  add column probability integer not null default 0 check (probability between 0 and 100),
  add column custom_data jsonb not null default '{}'::jsonb,
  add column won_at timestamptz,
  add column lost_at timestamptz,
  add column lost_reason text;

alter table public.deals drop constraint if exists deals_assigned_to_fkey;
alter table public.deals add constraint deals_assigned_tenant_fkey
  foreign key (tenant_id, assigned_to)
  references public.business_members (tenant_id, user_id)
  on delete set null (assigned_to);

-- A deal's stage must belong to the deal's pipeline (not merely the tenant).
alter table public.deals add constraint deals_pipeline_stage_tenant_fkey
  foreign key (tenant_id, pipeline_id, stage_id)
  references public.pipeline_stages (tenant_id, pipeline_id, id);

create trigger contacts_validate_assignment
  before insert or update on public.contacts
  for each row execute function public.validate_crm_assignment();

create trigger deals_validate_assignment
  before insert or update on public.deals
  for each row execute function public.validate_crm_assignment();

-- Tenant-scoped dedup and search indexes.
create unique index contacts_tenant_email_key
  on public.contacts (tenant_id, lower(email))
  where email is not null and lower(email) <> '';
create unique index contacts_tenant_phone_key
  on public.contacts (tenant_id, regexp_replace(phone, '\D', '', 'g'))
  where phone is not null and regexp_replace(phone, '\D', '', 'g') <> '';
create index contacts_tenant_lead_status_idx
  on public.contacts (tenant_id, lead_status, created_at desc);
create index contacts_tenant_company_idx
  on public.contacts (tenant_id, company);
create index contacts_tenant_source_idx
  on public.contacts (tenant_id, source_id);
create index deals_tenant_stage_idx
  on public.deals (tenant_id, stage_id);

-- -----------------------------------------------------------------------------
-- 3. New tenant-owned CRM tables
-- -----------------------------------------------------------------------------
create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  type text not null default 'other'
    check (type in ('website', 'whatsapp', 'referral', 'walk_in', 'advertisement', 'manual', 'other')),
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, name)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, name)
);

create table public.contact_tags (
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, contact_id, tag_id),
  foreign key (contact_id, tenant_id) references public.contacts(id, tenant_id) on delete cascade,
  foreign key (tag_id, tenant_id) references public.tags(id, tenant_id) on delete cascade
);

create table public.contact_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null,
  deal_id uuid,
  type text not null check (type in (
    'note', 'call', 'email', 'meeting', 'task',
    'status_change', 'stage_change', 'assignment', 'lead_created', 'deal_created'
  )),
  subject text,
  body text,
  occurred_at timestamptz not null default now(),
  created_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (contact_id, tenant_id) references public.contacts(id, tenant_id) on delete cascade,
  foreign key (deal_id, tenant_id) references public.deals(id, tenant_id) on delete set null (deal_id),
  foreign key (tenant_id, created_by) references public.business_members(tenant_id, user_id)
    on delete set null (created_by)
);

create table public.deal_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  deal_id uuid not null,
  user_id uuid not null,
  assigned_by uuid,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (deal_id, tenant_id) references public.deals(id, tenant_id) on delete cascade,
  foreign key (tenant_id, user_id) references public.business_members(tenant_id, user_id) on delete cascade,
  foreign key (tenant_id, assigned_by) references public.business_members(tenant_id, user_id)
    on delete set null (assigned_by)
);

create table public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  entity_type text not null check (entity_type in ('contact', 'lead', 'deal')),
  key text not null,
  label text not null,
  type text not null check (type in ('text', 'textarea', 'number', 'date', 'select', 'multiselect', 'boolean')),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, entity_type, key)
);

create index lead_sources_tenant_idx on public.lead_sources (tenant_id, position);
create index tags_tenant_idx on public.tags (tenant_id, name);
create index contact_tags_contact_idx on public.contact_tags (tenant_id, contact_id);
create index contact_activities_contact_idx
  on public.contact_activities (tenant_id, contact_id, occurred_at desc);
create index contact_activities_deal_idx
  on public.contact_activities (tenant_id, deal_id, occurred_at desc);
create index deal_assignments_deal_idx
  on public.deal_assignments (tenant_id, deal_id, created_at desc);
create index custom_fields_tenant_idx
  on public.custom_fields (tenant_id, entity_type, position);

create trigger lead_sources_set_updated_at
  before update on public.lead_sources
  for each row execute function public.set_updated_at();
create trigger tags_set_updated_at
  before update on public.tags
  for each row execute function public.set_updated_at();
create trigger custom_fields_set_updated_at
  before update on public.custom_fields
  for each row execute function public.set_updated_at();

-- Seed default lead sources for every business (existing + future).
create or replace function public.seed_default_lead_sources()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.lead_sources (tenant_id, name, type, position)
  values
    (new.id, 'Website', 'website', 1),
    (new.id, 'WhatsApp', 'whatsapp', 2),
    (new.id, 'Referral', 'referral', 3),
    (new.id, 'Walk-in', 'other', 4),
    (new.id, 'Advertisement', 'advertisement', 5),
    (new.id, 'Manual', 'manual', 6)
  on conflict (tenant_id, name) do nothing;
  return new;
end;
$$;

create trigger businesses_seed_lead_sources
  after insert on public.businesses
  for each row execute function public.seed_default_lead_sources();

insert into public.lead_sources (tenant_id, name, type, position)
select b.id, s.name, s.type, s.position
from public.businesses b
cross join (
  values
    ('Website', 'website', 1),
    ('WhatsApp', 'whatsapp', 2),
    ('Referral', 'referral', 3),
    ('Walk-in', 'other', 4),
    ('Advertisement', 'advertisement', 5),
    ('Manual', 'manual', 6)
) as s(name, type, position)
on conflict (tenant_id, name) do nothing;

-- -----------------------------------------------------------------------------
-- 4. Replace broad CRM RLS policies with least-privilege policies
-- -----------------------------------------------------------------------------
drop policy if exists "Tenant contacts access" on public.contacts;
drop policy if exists "Tenant pipelines access" on public.pipelines;
drop policy if exists "Tenant stages access" on public.pipeline_stages;
drop policy if exists "Tenant deals access" on public.deals;

create policy "CRM: read visible contacts" on public.contacts
  for select to authenticated
  using (public.can_view_contact(tenant_id, id));

create policy "CRM: create contacts" on public.contacts
  for insert to authenticated
  with check (
    public.has_tenant_access(tenant_id)
    and (public.can_manage_crm(tenant_id) or assigned_to = (select auth.uid()))
  );

create policy "CRM: update visible contacts" on public.contacts
  for update to authenticated
  using (public.can_edit_contact(tenant_id, id))
  with check (
    public.has_tenant_access(tenant_id)
    and (public.can_manage_crm(tenant_id) or assigned_to = (select auth.uid()))
  );

create policy "CRM: delete contacts" on public.contacts
  for delete to authenticated
  using (public.can_manage_crm(tenant_id));

create policy "CRM: read deals" on public.deals
  for select to authenticated
  using (public.can_view_deal(tenant_id, id));

create policy "CRM: create deals" on public.deals
  for insert to authenticated
  with check (
    public.has_tenant_access(tenant_id)
    and (public.can_manage_crm(tenant_id) or assigned_to = (select auth.uid()))
  );

create policy "CRM: update visible deals" on public.deals
  for update to authenticated
  using (public.can_edit_deal(tenant_id, id))
  with check (
    public.has_tenant_access(tenant_id)
    and (public.can_manage_crm(tenant_id) or assigned_to = (select auth.uid()))
  );

create policy "CRM: delete deals" on public.deals
  for delete to authenticated
  using (public.can_manage_crm(tenant_id));

-- Pipeline configuration is readable by all members, writable by managers+.
create policy "CRM: read pipelines" on public.pipelines
  for select to authenticated
  using (public.has_tenant_access(tenant_id));
create policy "CRM: manage pipelines" on public.pipelines
  for all to authenticated
  using (public.can_manage_crm(tenant_id))
  with check (public.can_manage_crm(tenant_id));

create policy "CRM: read stages" on public.pipeline_stages
  for select to authenticated
  using (public.has_tenant_access(tenant_id));
create policy "CRM: manage stages" on public.pipeline_stages
  for all to authenticated
  using (public.can_manage_crm(tenant_id))
  with check (public.can_manage_crm(tenant_id));

-- New tables.
alter table public.lead_sources enable row level security;
alter table public.tags enable row level security;
alter table public.contact_tags enable row level security;
alter table public.contact_activities enable row level security;
alter table public.deal_assignments enable row level security;
alter table public.custom_fields enable row level security;

create policy "CRM: read lead sources" on public.lead_sources
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "CRM: manage lead sources" on public.lead_sources
  for all to authenticated
  using (public.can_manage_crm(tenant_id))
  with check (public.can_manage_crm(tenant_id));

create policy "CRM: read tags" on public.tags
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "CRM: manage tags" on public.tags
  for all to authenticated
  using (public.can_manage_crm(tenant_id))
  with check (public.can_manage_crm(tenant_id));

create policy "CRM: read contact tags" on public.contact_tags
  for select to authenticated using (public.can_view_contact(tenant_id, contact_id));
create policy "CRM: add contact tags" on public.contact_tags
  for insert to authenticated
  with check (
    public.has_tenant_access(tenant_id)
    and public.can_edit_contact(tenant_id, contact_id)
  );
create policy "CRM: remove contact tags" on public.contact_tags
  for delete to authenticated
  using (public.can_edit_contact(tenant_id, contact_id));

-- Activities and deal assignments are append-only (no UPDATE/DELETE policy).
create policy "CRM: read activities" on public.contact_activities
  for select to authenticated using (public.can_view_activity(tenant_id, id));
create policy "CRM: add activities" on public.contact_activities
  for insert to authenticated
  with check (
    public.has_tenant_access(tenant_id)
    and created_by = (select auth.uid())
    and public.can_edit_contact(tenant_id, contact_id)
  );

create policy "CRM: read deal assignments" on public.deal_assignments
  for select to authenticated using (public.can_view_deal(tenant_id, deal_id));
create policy "CRM: add deal assignments" on public.deal_assignments
  for insert to authenticated
  with check (
    public.has_tenant_access(tenant_id)
    and public.can_manage_crm(tenant_id)
  );

create policy "CRM: read custom fields" on public.custom_fields
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "CRM: manage custom fields" on public.custom_fields
  for all to authenticated
  using (public.can_manage_crm(tenant_id))
  with check (public.can_manage_crm(tenant_id));

-- -----------------------------------------------------------------------------
-- 5. Trusted CRM RPCs
-- -----------------------------------------------------------------------------
create or replace function public.create_contact(
  p_tenant uuid,
  p_first_name text,
  p_last_name text default null,
  p_email text default null,
  p_phone text default null,
  p_company text default null,
  p_source text default null,
  p_source_id uuid default null,
  p_notes text default null,
  p_assigned_to uuid default null,
  p_lead_status text default 'new'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_assigned uuid;
  v_id uuid;
  v_source text := p_source;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if coalesce(trim(p_first_name), '') = '' then raise exception 'First name is required'; end if;
  if p_lead_status is null or p_lead_status not in ('new', 'contacted', 'qualified', 'unqualified', 'converted') then
    raise exception 'Invalid lead status';
  end if;

  if p_source_id is not null then
    select ls.name into v_source
    from public.lead_sources ls
    where ls.id = p_source_id and ls.tenant_id = p_tenant and ls.active;
    if not found then raise exception 'Invalid lead source'; end if;
  end if;

  if public.can_manage_crm(p_tenant) then
    v_assigned := p_assigned_to;
  else
    v_assigned := v_caller;
  end if;

  if v_assigned is not null and not public.is_active_member(p_tenant, v_assigned) then
    raise exception 'Assigned user is not an active member of this business';
  end if;

  insert into public.contacts (
    tenant_id, first_name, last_name, email, phone, company, source, source_id,
    notes, status, lead_status, assigned_to
  ) values (
    p_tenant, trim(p_first_name), nullif(trim(p_last_name), ''),
    nullif(lower(trim(p_email)), ''), nullif(trim(p_phone), ''),
    nullif(trim(p_company), ''), v_source, p_source_id,
    p_notes, 'lead', p_lead_status, v_assigned
  ) returning id into v_id;

  insert into public.contact_activities (tenant_id, contact_id, type, subject, body, created_by, metadata)
  values (p_tenant, v_id, 'lead_created', 'Lead created', p_notes, v_caller,
          jsonb_build_object('source', v_source, 'lead_status', p_lead_status));

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'contact.created', 'contact', v_id::text,
          jsonb_build_object('source', v_source));

  return v_id;
end;
$$;

create or replace function public.update_contact(
  p_tenant uuid,
  p_contact uuid,
  p_first_name text,
  p_last_name text default null,
  p_email text default null,
  p_phone text default null,
  p_company text default null,
  p_notes text default null,
  p_lead_status text default null,
  p_follow_up_at timestamptz default null,
  p_status text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_old public.contacts%rowtype;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.can_edit_contact(p_tenant, p_contact) then raise exception 'Cannot edit this contact'; end if;
  if coalesce(trim(p_first_name), '') = '' then raise exception 'First name is required'; end if;
  if p_lead_status is not null and p_lead_status not in ('new', 'contacted', 'qualified', 'unqualified', 'converted') then
    raise exception 'Invalid lead status';
  end if;
  if p_status is not null and p_status not in ('lead', 'customer', 'inactive') then
    raise exception 'Invalid contact status';
  end if;

  select * into v_old from public.contacts c where c.tenant_id = p_tenant and c.id = p_contact;
  if not found then raise exception 'Contact not found'; end if;

  update public.contacts c
  set first_name = trim(p_first_name),
      last_name = nullif(trim(p_last_name), ''),
      email = nullif(lower(trim(p_email)), ''),
      phone = nullif(trim(p_phone), ''),
      company = nullif(trim(p_company), ''),
      notes = p_notes,
      lead_status = coalesce(p_lead_status, c.lead_status),
      follow_up_at = p_follow_up_at,
      status = coalesce(p_status, c.status),
      converted_at = case when coalesce(p_status, c.status) = 'customer' and c.converted_at is null
                          then now() else c.converted_at end
  where c.tenant_id = p_tenant and c.id = p_contact;

  if (p_lead_status is not null and p_lead_status is distinct from v_old.lead_status)
     or (p_status is not null and p_status is distinct from v_old.status) then
    insert into public.contact_activities (tenant_id, contact_id, type, subject, created_by, metadata)
    values (p_tenant, p_contact, 'status_change', 'Status updated', v_caller,
            jsonb_build_object('old_lead_status', v_old.lead_status,
                               'new_lead_status', coalesce(p_lead_status, v_old.lead_status),
                               'old_status', v_old.status,
                               'new_status', coalesce(p_status, v_old.status)));
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'contact.updated', 'contact', p_contact::text, '{}'::jsonb);
end;
$$;

create or replace function public.archive_contact(p_tenant uuid, p_contact uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_caller uuid := (select auth.uid());
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.can_manage_crm(p_tenant) then raise exception 'Only managers can archive contacts'; end if;

  update public.contacts c set status = 'inactive'
  where c.tenant_id = p_tenant and c.id = p_contact and c.status <> 'inactive';
  if not found then raise exception 'Contact not found'; end if;

  insert into public.contact_activities (tenant_id, contact_id, type, subject, created_by)
  values (p_tenant, p_contact, 'status_change', 'Contact archived', v_caller);

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'contact.archived', 'contact', p_contact::text, '{}'::jsonb);
end;
$$;

create or replace function public.claim_lead(p_tenant uuid, p_contact uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_row public.contacts%rowtype;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;

  select * into v_row from public.contacts c where c.tenant_id = p_tenant and c.id = p_contact;
  if not found then raise exception 'Lead not found'; end if;
  if v_row.status <> 'lead' then raise exception 'This record is not a lead'; end if;
  if v_row.assigned_to is not null and v_row.assigned_to <> v_caller then
    raise exception 'This lead is already assigned';
  end if;

  update public.contacts c set assigned_to = v_caller
  where c.tenant_id = p_tenant and c.id = p_contact;

  insert into public.contact_activities (tenant_id, contact_id, type, subject, created_by, metadata)
  values (p_tenant, p_contact, 'assignment', 'Lead claimed', v_caller,
          jsonb_build_object('assigned_to', v_caller));

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'lead.claimed', 'contact', p_contact::text, '{}'::jsonb);
end;
$$;

create or replace function public.assign_contact(p_tenant uuid, p_contact uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_caller uuid := (select auth.uid());
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.can_manage_crm(p_tenant) then raise exception 'Only managers can assign contacts'; end if;
  if not public.is_active_member(p_tenant, p_user_id) then
    raise exception 'Assigned user is not an active member of this business';
  end if;

  update public.contacts c set assigned_to = p_user_id
  where c.tenant_id = p_tenant and c.id = p_contact;
  if not found then raise exception 'Contact not found'; end if;

  insert into public.contact_activities (tenant_id, contact_id, type, subject, created_by, metadata)
  values (p_tenant, p_contact, 'assignment', 'Contact assigned', v_caller,
          jsonb_build_object('assigned_to', p_user_id));

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'contact.assigned', 'contact', p_contact::text,
          jsonb_build_object('assigned_to', p_user_id));
end;
$$;

-- Validates a pipeline/stage pair inside the given tenant.
create or replace function public.validate_deal_stage(
  p_tenant uuid, p_pipeline_id uuid, p_stage_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.pipeline_stages s
    where s.tenant_id = p_tenant and s.id = p_stage_id and s.pipeline_id = p_pipeline_id
  ) then
    raise exception 'Stage does not belong to this pipeline';
  end if;
end;
$$;

create or replace function public.create_deal(
  p_tenant uuid,
  p_contact uuid,
  p_pipeline_id uuid,
  p_stage_id uuid,
  p_title text,
  p_value numeric default 0,
  p_currency text default 'INR',
  p_assigned_to uuid default null,
  p_expected_close_date date default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_assigned uuid;
  v_id uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Deal title is required'; end if;
  if not public.can_view_contact(p_tenant, p_contact) then raise exception 'Cannot access this contact'; end if;
  perform public.validate_deal_stage(p_tenant, p_pipeline_id, p_stage_id);

  if public.can_manage_crm(p_tenant) then
    v_assigned := p_assigned_to;
  else
    v_assigned := v_caller;
  end if;
  if v_assigned is not null and not public.is_active_member(p_tenant, v_assigned) then
    raise exception 'Assigned user is not an active member of this business';
  end if;

  insert into public.deals (
    tenant_id, contact_id, pipeline_id, stage_id, title, value, currency,
    assigned_to, status, expected_close_date, description, probability
  ) values (
    p_tenant, p_contact, p_pipeline_id, p_stage_id, trim(p_title),
    coalesce(p_value, 0), coalesce(p_currency, 'INR'), v_assigned, 'open',
    p_expected_close_date, p_description, 0
  ) returning id into v_id;

  insert into public.deal_assignments (tenant_id, deal_id, user_id, assigned_by)
  select p_tenant, v_id, v_assigned, v_caller where v_assigned is not null;

  insert into public.contact_activities (tenant_id, contact_id, deal_id, type, subject, created_by, metadata)
  values (p_tenant, p_contact, v_id, 'deal_created', 'Deal created', v_caller,
          jsonb_build_object('title', p_title, 'value', coalesce(p_value, 0)));

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'deal.created', 'deal', v_id::text, '{}'::jsonb);

  return v_id;
end;
$$;

create or replace function public.move_deal_stage(p_tenant uuid, p_deal uuid, p_stage_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_deal public.deals%rowtype;
  v_stage public.pipeline_stages%rowtype;
  v_new_status text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.can_edit_deal(p_tenant, p_deal) then raise exception 'Cannot edit this deal'; end if;

  select * into v_deal from public.deals d where d.tenant_id = p_tenant and d.id = p_deal;
  if not found then raise exception 'Deal not found'; end if;

  select * into v_stage from public.pipeline_stages s
  where s.tenant_id = p_tenant and s.id = p_stage_id and s.pipeline_id = v_deal.pipeline_id;
  if not found then raise exception 'Stage does not belong to this pipeline'; end if;

  if v_stage.is_won then v_new_status := 'won';
  elsif v_stage.is_closed then v_new_status := 'lost';
  else v_new_status := 'open'; end if;

  update public.deals d
  set stage_id = p_stage_id,
      status = v_new_status,
      probability = v_stage.probability,
      won_at = case when v_new_status = 'won' then coalesce(d.won_at, now()) else d.won_at end,
      lost_at = case when v_new_status = 'lost' then coalesce(d.lost_at, now()) else d.lost_at end
  where d.tenant_id = p_tenant and d.id = p_deal;

  insert into public.contact_activities (tenant_id, contact_id, deal_id, type, subject, created_by, metadata)
  values (p_tenant, v_deal.contact_id, p_deal, 'stage_change', 'Deal moved', v_caller,
          jsonb_build_object('old_stage_id', v_deal.stage_id, 'new_stage_id', p_stage_id,
                             'new_stage', v_stage.name, 'new_status', v_new_status));

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'deal.stage_changed', 'deal', p_deal::text,
          jsonb_build_object('new_stage_id', p_stage_id, 'new_status', v_new_status));
end;
$$;

create or replace function public.assign_deal(p_tenant uuid, p_deal uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_contact uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.can_manage_crm(p_tenant) then raise exception 'Only managers can assign deals'; end if;
  if p_user_id is not null and not public.is_active_member(p_tenant, p_user_id) then
    raise exception 'Assigned user is not an active member of this business';
  end if;

  update public.deals d set assigned_to = p_user_id
  where d.tenant_id = p_tenant and d.id = p_deal
  returning d.contact_id into v_contact;
  if not found then raise exception 'Deal not found'; end if;

  if p_user_id is not null then
    insert into public.deal_assignments (tenant_id, deal_id, user_id, assigned_by)
    values (p_tenant, p_deal, p_user_id, v_caller);
  end if;

  insert into public.contact_activities (tenant_id, contact_id, deal_id, type, subject, created_by, metadata)
  values (p_tenant, v_contact, p_deal, 'assignment', 'Deal assigned', v_caller,
          jsonb_build_object('assigned_to', p_user_id));

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'deal.assigned', 'deal', p_deal::text,
          jsonb_build_object('assigned_to', p_user_id));
end;
$$;

create or replace function public.convert_lead_to_deal(
  p_tenant uuid,
  p_contact uuid,
  p_pipeline_id uuid,
  p_stage_id uuid,
  p_title text,
  p_value numeric default 0,
  p_currency text default 'INR',
  p_assigned_to uuid default null,
  p_expected_close_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_contact public.contacts%rowtype;
  v_assigned uuid;
  v_deal uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Deal title is required'; end if;

  select * into v_contact from public.contacts c where c.tenant_id = p_tenant and c.id = p_contact;
  if not found then raise exception 'Contact not found'; end if;
  if v_contact.status <> 'lead' then raise exception 'Only leads can be converted'; end if;
  perform public.validate_deal_stage(p_tenant, p_pipeline_id, p_stage_id);

  if public.can_manage_crm(p_tenant) then
    v_assigned := coalesce(p_assigned_to, v_contact.assigned_to, v_caller);
  else
    -- Employees claim the lead as part of conversion.
    v_assigned := v_caller;
  end if;
  if not public.is_active_member(p_tenant, v_assigned) then
    raise exception 'Assigned user is not an active member of this business';
  end if;

  update public.contacts c
  set status = 'customer',
      lead_status = 'converted',
      converted_at = now(),
      assigned_to = v_assigned
  where c.tenant_id = p_tenant and c.id = p_contact;

  insert into public.deals (
    tenant_id, contact_id, pipeline_id, stage_id, title, value, currency,
    assigned_to, status, expected_close_date
  ) values (
    p_tenant, p_contact, p_pipeline_id, p_stage_id, trim(p_title),
    coalesce(p_value, 0), coalesce(p_currency, 'INR'), v_assigned, 'open',
    p_expected_close_date
  ) returning id into v_deal;

  insert into public.deal_assignments (tenant_id, deal_id, user_id, assigned_by)
  values (p_tenant, v_deal, v_assigned, v_caller);

  insert into public.contact_activities (tenant_id, contact_id, deal_id, type, subject, created_by, metadata)
  values (p_tenant, p_contact, v_deal, 'deal_created', 'Lead converted to deal', v_caller,
          jsonb_build_object('title', p_title, 'value', coalesce(p_value, 0)));

  insert into public.contact_activities (tenant_id, contact_id, type, subject, created_by, metadata)
  values (p_tenant, p_contact, 'status_change', 'Lead converted', v_caller,
          jsonb_build_object('from', 'lead', 'to', 'customer', 'deal_id', v_deal));

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'lead.converted', 'contact', p_contact::text,
          jsonb_build_object('deal_id', v_deal));

  return v_deal;
end;
$$;

create or replace function public.add_contact_activity(
  p_tenant uuid,
  p_contact uuid,
  p_type text,
  p_subject text default null,
  p_body text default null,
  p_deal_id uuid default null,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_id uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.can_edit_contact(p_tenant, p_contact) then raise exception 'Cannot edit this contact'; end if;
  if p_type not in ('note', 'call', 'email', 'meeting', 'task', 'status_change',
                    'stage_change', 'assignment', 'lead_created', 'deal_created') then
    raise exception 'Invalid activity type';
  end if;
  if p_deal_id is not null and not public.can_view_deal(p_tenant, p_deal_id) then
    raise exception 'Cannot access this deal';
  end if;

  insert into public.contact_activities (
    tenant_id, contact_id, deal_id, type, subject, body, occurred_at, created_by
  ) values (
    p_tenant, p_contact, p_deal_id, p_type, p_subject, p_body,
    coalesce(p_occurred_at, now()), v_caller
  ) returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'activity.created', 'contact_activity', v_id::text,
          jsonb_build_object('type', p_type, 'contact_id', p_contact));

  return v_id;
end;
$$;

create or replace function public.create_pipeline(
  p_tenant uuid,
  p_name text,
  p_description text default null,
  p_color text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_caller uuid := (select auth.uid()); v_id uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.can_manage_crm(p_tenant) then raise exception 'Only managers can configure pipelines'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Pipeline name is required'; end if;

  insert into public.pipelines (tenant_id, name, description, color, position)
  values (p_tenant, trim(p_name), p_description, p_color,
          (select count(*) from public.pipelines p where p.tenant_id = p_tenant))
  returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'pipeline.created', 'pipeline', v_id::text, '{}'::jsonb);
  return v_id;
end;
$$;

create or replace function public.create_pipeline_stage(
  p_tenant uuid,
  p_pipeline_id uuid,
  p_name text,
  p_probability integer default 0,
  p_is_closed boolean default false,
  p_is_won boolean default false,
  p_color text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_caller uuid := (select auth.uid()); v_id uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.can_manage_crm(p_tenant) then raise exception 'Only managers can configure stages'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Stage name is required'; end if;
  if p_probability is null or p_probability not between 0 and 100 then
    raise exception 'Probability must be between 0 and 100';
  end if;
  if not exists (select 1 from public.pipelines p where p.id = p_pipeline_id and p.tenant_id = p_tenant) then
    raise exception 'Pipeline not found';
  end if;

  insert into public.pipeline_stages (tenant_id, pipeline_id, name, position, probability, is_closed, is_won, color)
  values (p_tenant, p_pipeline_id, trim(p_name),
          (select count(*) from public.pipeline_stages s where s.tenant_id = p_tenant and s.pipeline_id = p_pipeline_id),
          p_probability, p_is_closed, p_is_won, p_color)
  returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'stage.created', 'pipeline_stage', v_id::text,
          jsonb_build_object('pipeline_id', p_pipeline_id));
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Search / dashboard RPCs (real data only)
-- -----------------------------------------------------------------------------
create or replace function public.crm_search_contacts(
  p_tenant uuid,
  p_query text default null,
  p_status text default null,
  p_lead_status text default null,
  p_source_id uuid default null,
  p_assigned_to uuid default null,
  p_tag_id uuid default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  company text,
  status text,
  lead_status text,
  source_id uuid,
  assigned_to uuid,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_query text := nullif(trim(coalesce(p_query, '')), '');
begin
  if not public.has_tenant_access(p_tenant) then return; end if;

  return query
  select c.id, c.first_name, c.last_name, c.email, c.phone, c.company,
         c.status, c.lead_status, c.source_id, c.assigned_to, c.created_at,
         count(*) over () as total_count
  from public.contacts c
  where c.tenant_id = p_tenant
    and public.can_view_contact(p_tenant, c.id)
    and (v_query is null
         or c.first_name ilike '%' || v_query || '%'
         or coalesce(c.last_name, '') ilike '%' || v_query || '%'
         or coalesce(c.email, '') ilike '%' || v_query || '%'
         or coalesce(c.phone, '') ilike '%' || v_query || '%'
         or coalesce(c.company, '') ilike '%' || v_query || '%')
    and (p_status is null or c.status = p_status)
    and (p_lead_status is null or c.lead_status = p_lead_status)
    and (p_source_id is null or c.source_id = p_source_id)
    and (p_assigned_to is null or c.assigned_to = p_assigned_to)
    and (p_tag_id is null or exists (
      select 1 from public.contact_tags ct
      where ct.tenant_id = c.tenant_id and ct.contact_id = c.id and ct.tag_id = p_tag_id
    ))
  order by c.created_at desc
  limit v_limit offset v_offset;
end;
$$;

create or replace function public.crm_dashboard_metrics(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sources jsonb;
  v_stages jsonb;
  v_recent jsonb;
begin
  if not public.has_tenant_access(p_tenant) then return '{}'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'count', x.cnt) order by x.cnt desc), '[]'::jsonb)
  into v_sources
  from (
    select coalesce(ls.name, c.source, 'Unknown') as label, count(*) as cnt
    from public.contacts c
    left join public.lead_sources ls on ls.id = c.source_id and ls.tenant_id = c.tenant_id
    where c.tenant_id = p_tenant
      and c.status = 'lead'
      and public.can_view_contact(p_tenant, c.id)
    group by 1
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
           'stage', x.name, 'count', x.cnt, 'value', x.val, 'position', x.pos
         ) order by x.pos), '[]'::jsonb)
  into v_stages
  from (
    select s.name, s.position as pos, count(d.id) as cnt, coalesce(sum(d.value), 0) as val
    from public.pipeline_stages s
    left join public.deals d
      on d.tenant_id = s.tenant_id
     and d.stage_id = s.id
     and public.can_view_deal(p_tenant, d.id)
    where s.tenant_id = p_tenant
    group by s.id, s.name, s.position
  ) x;

  select coalesce(jsonb_agg(x.obj order by x.occurred_at desc), '[]'::jsonb)
  into v_recent
  from (
    select jsonb_build_object(
             'id', a.id, 'type', a.type, 'subject', a.subject, 'body', a.body,
             'contact_id', a.contact_id, 'deal_id', a.deal_id,
             'occurred_at', a.occurred_at, 'created_at', a.created_at
           ) as obj,
           a.occurred_at
    from public.contact_activities a
    where a.tenant_id = p_tenant
      and public.can_view_activity(p_tenant, a.id)
    order by a.occurred_at desc
    limit 8
  ) x;

  return jsonb_build_object(
    'total_contacts', (
      select count(*) from public.contacts c
      where c.tenant_id = p_tenant and public.can_view_contact(p_tenant, c.id)
    ),
    'new_leads', (
      select count(*) from public.contacts c
      where c.tenant_id = p_tenant and c.status = 'lead' and c.lead_status = 'new'
        and public.can_view_contact(p_tenant, c.id)
    ),
    'qualified_leads', (
      select count(*) from public.contacts c
      where c.tenant_id = p_tenant and c.lead_status = 'qualified'
        and public.can_view_contact(p_tenant, c.id)
    ),
    'open_deals', (
      select count(*) from public.deals d
      where d.tenant_id = p_tenant and d.status = 'open'
        and public.can_view_deal(p_tenant, d.id)
    ),
    'won_deals', (
      select count(*) from public.deals d
      where d.tenant_id = p_tenant and d.status = 'won'
        and public.can_view_deal(p_tenant, d.id)
    ),
    'open_pipeline_value', (
      select coalesce(sum(d.value), 0) from public.deals d
      where d.tenant_id = p_tenant and d.status = 'open'
        and public.can_view_deal(p_tenant, d.id)
    ),
    'leads_by_source', v_sources,
    'deals_by_stage', v_stages,
    'recent_activities', v_recent
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Approved Milestone 1 hardening
-- -----------------------------------------------------------------------------

-- 7a. Invitations are created only through the validated RPC.
drop policy if exists "Admins create invitations" on public.business_invitations;
revoke insert on public.business_invitations from authenticated;

-- 7b. Business configuration is owner/admin only (client matrix agrees).
drop policy if exists "Tenant business settings access" on public.business_settings;
drop policy if exists "Tenant branches access" on public.branches;
drop policy if exists "Tenant template settings access" on public.business_template_settings;

create policy "Config: read business settings" on public.business_settings
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Config: manage business settings" on public.business_settings
  for all to authenticated
  using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
  with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

create policy "Config: read branches" on public.branches
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Config: manage branches" on public.branches
  for all to authenticated
  using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
  with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

create policy "Config: read template settings" on public.business_template_settings
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Config: manage template settings" on public.business_template_settings
  for all to authenticated
  using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
  with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

-- 7c. Narrow the invitation GUC bypass: it now carries a single tenant id, is
-- accepted only for the caller's own non-owner membership upsert, and is
-- cleared immediately after use.
create or replace function public.accept_business_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.business_invitations%rowtype;
  v_caller uuid := (select auth.uid());
  v_email text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  select * into v_inv
  from public.business_invitations i
  where i.token = p_token
    and i.accepted_at is null
    and i.expires_at > now();

  if not found then raise exception 'Invitation not found or expired'; end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_caller;
  if v_email is null or v_email <> v_inv.email then
    raise exception 'This invitation was sent to a different email address';
  end if;

  -- Scoped bypass: tenant id only; cleared directly after the membership write.
  perform set_config('app.invitation_accept', v_inv.tenant_id::text, true);

  if exists (
    select 1 from public.business_members bm
    where bm.tenant_id = v_inv.tenant_id
      and bm.user_id = v_caller
      and bm.role = 'owner'
  ) then
    update public.business_members bm
    set status = 'active'
    where bm.tenant_id = v_inv.tenant_id and bm.user_id = v_caller;
  else
    insert into public.business_members (tenant_id, user_id, role, status)
    values (v_inv.tenant_id, v_caller, v_inv.role, 'active')
    on conflict (tenant_id, user_id) do update
      set role = excluded.role, status = 'active';
  end if;

  perform set_config('app.invitation_accept', '', true);

  update public.business_invitations i
  set accepted_at = now()
  where i.id = v_inv.id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_inv.tenant_id, v_caller, 'invitation.accepted', 'invitation', v_inv.id::text, '{}'::jsonb);

  return v_inv.tenant_id;
end;
$$;

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
  -- Only the exact invitation flow may bypass the self-role guard, and only for
  -- the caller's own active non-owner membership in the invited tenant.
  if v_accept_tenant is not null
     and tg_op <> 'DELETE'
     and new.tenant_id::text = v_accept_tenant
     and new.user_id = v_caller
     and new.role in ('admin', 'manager', 'employee')
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

-- -----------------------------------------------------------------------------
-- 8. Grants (least privilege)
-- -----------------------------------------------------------------------------
revoke all on public.lead_sources, public.tags, public.contact_tags,
  public.contact_activities, public.deal_assignments, public.custom_fields
  from anon;

grant select on public.lead_sources, public.tags, public.contact_tags,
  public.contact_activities, public.deal_assignments, public.custom_fields
  to authenticated;
grant insert, update, delete on public.lead_sources, public.tags, public.custom_fields
  to authenticated;
grant insert, delete on public.contact_tags to authenticated;
grant insert on public.contact_activities, public.deal_assignments to authenticated;

revoke all on function public.can_manage_crm(uuid) from public;
revoke all on function public.is_active_member(uuid, uuid) from public;
revoke all on function public.can_view_contact(uuid, uuid) from public;
revoke all on function public.can_edit_contact(uuid, uuid) from public;
revoke all on function public.can_view_deal(uuid, uuid) from public;
revoke all on function public.can_edit_deal(uuid, uuid) from public;
revoke all on function public.can_view_activity(uuid, uuid) from public;
revoke all on function public.validate_crm_assignment() from public;
revoke all on function public.validate_deal_stage(uuid, uuid, uuid) from public;
revoke all on function public.seed_default_lead_sources() from public;
revoke all on function public.create_contact(uuid, text, text, text, text, text, text, uuid, text, uuid, text) from public;
revoke all on function public.update_contact(uuid, uuid, text, text, text, text, text, text, text, timestamptz, text) from public;
revoke all on function public.archive_contact(uuid, uuid) from public;
revoke all on function public.claim_lead(uuid, uuid) from public;
revoke all on function public.assign_contact(uuid, uuid, uuid) from public;
revoke all on function public.create_deal(uuid, uuid, uuid, uuid, text, numeric, text, uuid, date, text) from public;
revoke all on function public.move_deal_stage(uuid, uuid, uuid) from public;
revoke all on function public.assign_deal(uuid, uuid, uuid) from public;
revoke all on function public.convert_lead_to_deal(uuid, uuid, uuid, uuid, text, numeric, text, uuid, date) from public;
revoke all on function public.add_contact_activity(uuid, uuid, text, text, text, uuid, timestamptz) from public;
revoke all on function public.create_pipeline(uuid, text, text, text) from public;
revoke all on function public.create_pipeline_stage(uuid, uuid, text, integer, boolean, boolean, text) from public;
revoke all on function public.crm_search_contacts(uuid, text, text, text, uuid, uuid, uuid, integer, integer) from public;
revoke all on function public.crm_dashboard_metrics(uuid) from public;
revoke all on function public.accept_business_invitation(text) from public;
revoke all on function public.protect_membership_changes() from public;

grant execute on function public.can_manage_crm(uuid) to authenticated;
grant execute on function public.is_active_member(uuid, uuid) to authenticated;
grant execute on function public.can_view_contact(uuid, uuid) to authenticated;
grant execute on function public.can_edit_contact(uuid, uuid) to authenticated;
grant execute on function public.can_view_deal(uuid, uuid) to authenticated;
grant execute on function public.can_edit_deal(uuid, uuid) to authenticated;
grant execute on function public.can_view_activity(uuid, uuid) to authenticated;
grant execute on function public.validate_crm_assignment() to authenticated;
grant execute on function public.validate_deal_stage(uuid, uuid, uuid) to authenticated;
grant execute on function public.create_contact(uuid, text, text, text, text, text, text, uuid, text, uuid, text) to authenticated;
grant execute on function public.update_contact(uuid, uuid, text, text, text, text, text, text, text, timestamptz, text) to authenticated;
grant execute on function public.archive_contact(uuid, uuid) to authenticated;
grant execute on function public.claim_lead(uuid, uuid) to authenticated;
grant execute on function public.assign_contact(uuid, uuid, uuid) to authenticated;
grant execute on function public.create_deal(uuid, uuid, uuid, uuid, text, numeric, text, uuid, date, text) to authenticated;
grant execute on function public.move_deal_stage(uuid, uuid, uuid) to authenticated;
grant execute on function public.assign_deal(uuid, uuid, uuid) to authenticated;
grant execute on function public.convert_lead_to_deal(uuid, uuid, uuid, uuid, text, numeric, text, uuid, date) to authenticated;
grant execute on function public.add_contact_activity(uuid, uuid, text, text, text, uuid, timestamptz) to authenticated;
grant execute on function public.create_pipeline(uuid, text, text, text) to authenticated;
grant execute on function public.create_pipeline_stage(uuid, uuid, text, integer, boolean, boolean, text) to authenticated;
grant execute on function public.crm_search_contacts(uuid, text, text, text, uuid, uuid, uuid, integer, integer) to authenticated;
grant execute on function public.crm_dashboard_metrics(uuid) to authenticated;
grant execute on function public.accept_business_invitation(text) to authenticated;

commit;
