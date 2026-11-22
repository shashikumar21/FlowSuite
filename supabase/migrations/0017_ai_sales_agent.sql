-- Milestone: AI Sales Agent (native BusinessOS module) — Phase 2 foundation.
--
-- Design rules (continues the M2/M3/M4 contract):
-- * Tenant identity is always derived from the authenticated membership. Every
--   RPC re-checks public.has_tenant_access(p_tenant) BEFORE touching any row.
-- * RLS remains authoritative for direct table access. Browser code receives
--   SELECT only; every write goes through a SECURITY DEFINER RPC that is
--   revoked from public and granted narrowly to authenticated.
-- * No live business discovery, contact verification or email sending exists.
--   `provider` columns and provider-shaped RPCs are abstractions only; they
--   default to 'manual' and fail closed. Nothing here is granted to anon.
-- * A valid-looking email is NEVER marked verified by syntax alone. Only an
--   explicit manual attestation or a configured provider (later phase) may
--   write 'verified', and that is recorded in contact_verifications.
-- * Duplicate prevention is tenant-scoped and enforced by unique partial
--   indexes (database backstop) plus an explicit lookup RPC (friendly UX).
-- * Events are appended to the existing immutable public.audit_logs table.
--   Campaign, outbox, reply and suppression tables are created now so the
--   dashboard metrics are real counts over real (currently empty) tables;
--   their workflows arrive in Phase 3/4. No sending is possible from this
--   migration.
--
-- LOCAL ONLY: not applied to the hosted project.

begin;

-- ---------------------------------------------------------------------------
-- 1. Permission helpers (same shape as can_manage_ai / can_manage_crm)
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_sales_agent(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_tenant_role(p_tenant, array['owner', 'admin']);
$$;

comment on function public.can_manage_sales_agent(uuid) is
  'True for owner/admin of an active membership. Sales Agent destructive/config changes only.';

-- Server-authoritative suppression lookup. Phase 3 sending MUST call this or
-- re-check the same table; the browser is never trusted to skip suppression.
create or replace function public.sales_is_suppressed(p_tenant uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_email is not null
    and exists (
      select 1 from public.suppression_list s
      where s.tenant_id = p_tenant
        and lower(s.email) = lower(btrim(p_email))
    );
$$;

comment on function public.sales_is_suppressed(uuid, text) is
  'True when the tenant has suppressed this email. Check server-side before any send.';

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

create table public.prospect_searches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  created_by uuid,
  name text not null check (length(btrim(name)) between 1 and 120),
  criteria jsonb not null default '{}'::jsonb,
  -- 'manual' means criteria were entered by a person; no provider was called.
  provider text not null default 'manual'
    check (provider in ('manual', 'google_places', 'other')),
  result_count integer not null default 0 check (result_count >= 0),
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (tenant_id, created_by)
    references public.business_members(tenant_id, user_id) on delete set null
);

create index prospect_searches_tenant_idx
  on public.prospect_searches(tenant_id, created_at desc);

create trigger prospect_searches_set_updated_at
before update on public.prospect_searches
for each row execute function public.set_updated_at();

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  business_name text not null check (length(btrim(business_name)) between 1 and 200),
  industry text,
  city text,
  state text,
  country text,
  website text,
  business_size text,
  contact_person text,
  email text,
  phone text,
  source text not null default 'manual' check (length(btrim(source)) between 1 and 80),
  source_reference uuid,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'invalid', 'unknown')),
  lead_status text not null default 'new'
    check (lead_status in ('new', 'contacted', 'qualified', 'unqualified', 'converted')),
  assigned_to uuid,
  created_by uuid,
  notes text,
  custom_data jsonb not null default '{}'::jsonb,
  converted_at timestamptz,
  converted_contact_id uuid,
  attribution jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (tenant_id, source_reference)
    references public.prospect_searches(id, tenant_id) on delete set null,
  foreign key (tenant_id, assigned_to)
    references public.business_members(tenant_id, user_id) on delete set null,
  foreign key (tenant_id, created_by)
    references public.business_members(tenant_id, user_id) on delete set null,
  foreign key (tenant_id, converted_contact_id)
    references public.contacts(id, tenant_id) on delete set null
);

-- Duplicate backstops. RPCs normalise website before insert so the website key
-- is effective across http/https/www/trailing-slash variants.
create unique index prospects_tenant_email_key
  on public.prospects (tenant_id, lower(email))
  where email is not null and lower(email) <> '';

create unique index prospects_tenant_website_key
  on public.prospects (tenant_id, lower(website))
  where website is not null and lower(website) <> '';

create unique index prospects_tenant_name_location_key
  on public.prospects (
    tenant_id,
    lower(btrim(business_name)),
    lower(coalesce(city, '')),
    lower(coalesce(country, ''))
  );

create index prospects_tenant_status_idx
  on public.prospects(tenant_id, lead_status, verification_status);
create index prospects_tenant_source_idx on public.prospects(tenant_id, source);
create index prospects_tenant_assigned_idx on public.prospects(tenant_id, assigned_to);
create index prospects_tenant_created_idx on public.prospects(tenant_id, created_at desc);

create trigger prospects_set_updated_at
before update on public.prospects
for each row execute function public.set_updated_at();

create table public.decision_makers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  prospect_id uuid not null,
  full_name text not null check (length(btrim(full_name)) between 1 and 150),
  job_title text,
  email text,
  phone text,
  linkedin_url text,
  research_source text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'invalid', 'unknown')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (prospect_id, tenant_id)
    references public.prospects(id, tenant_id) on delete cascade,
  foreign key (tenant_id, created_by)
    references public.business_members(tenant_id, user_id) on delete set null
);

create unique index decision_makers_prospect_email_key
  on public.decision_makers (tenant_id, prospect_id, lower(email))
  where email is not null and lower(email) <> '';

create index decision_makers_tenant_idx
  on public.decision_makers(tenant_id, prospect_id);

create trigger decision_makers_set_updated_at
before update on public.decision_makers
for each row execute function public.set_updated_at();

-- Append-only verification evidence. Syntax checks never produce 'verified'.
create table public.contact_verifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  entity_type text not null check (entity_type in ('prospect', 'decision_maker')),
  entity_id uuid not null,
  method text not null check (method in ('manual', 'provider')),
  status text not null
    check (status in ('unverified', 'pending', 'verified', 'invalid', 'unknown')),
  provider text,
  checked_by uuid,
  checked_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb,
  -- A verified result must name either a provider or the human who attested.
  constraint contact_verifications_verified_evidence check (
    status <> 'verified'
    or (method = 'provider' and provider is not null and btrim(provider) <> '')
    or (method = 'manual' and checked_by is not null)
  ),
  foreign key (tenant_id, checked_by)
    references public.business_members(tenant_id, user_id) on delete set null
);

create index contact_verifications_lookup_idx
  on public.contact_verifications(tenant_id, entity_type, entity_id, checked_at desc);

create table public.prospect_signals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  prospect_id uuid not null,
  signal_type text not null default 'note'
    check (signal_type in ('note', 'website', 'news', 'referral', 'other')),
  summary text not null check (length(btrim(summary)) between 1 and 2000),
  source_url text,
  recorded_by uuid,
  created_at timestamptz not null default now(),
  foreign key (prospect_id, tenant_id)
    references public.prospects(id, tenant_id) on delete cascade,
  foreign key (tenant_id, recorded_by)
    references public.business_members(tenant_id, user_id) on delete set null
);

create index prospect_signals_tenant_idx
  on public.prospect_signals(tenant_id, prospect_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Foundation tables for Phase 3/4. No sending/ingestion exists yet, so all
--    counts derived from them are genuine zeros until a later phase writes rows.
-- ---------------------------------------------------------------------------

create table public.outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  status text not null default 'draft'
    check (status in (
      'draft', 'pending_approval', 'approved', 'rejected',
      'active', 'paused', 'completed', 'cancelled'
    )),
  subject text,
  body text,
  tone text,
  objective text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  rejected_reason text,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, name),
  foreign key (tenant_id, created_by)
    references public.business_members(tenant_id, user_id) on delete set null,
  foreign key (tenant_id, approved_by)
    references public.business_members(tenant_id, user_id) on delete set null
);

create trigger outreach_campaigns_set_updated_at
before update on public.outreach_campaigns
for each row execute function public.set_updated_at();

create table public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  campaign_id uuid not null,
  prospect_id uuid not null,
  recipient_email text,
  subject text not null check (length(btrim(subject)) between 1 and 200),
  body text not null check (length(btrim(body)) between 1 and 10000),
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'approved', 'rejected', 'queued', 'sent', 'failed', 'cancelled')),
  approved_by uuid,
  approved_at timestamptz,
  rejected_reason text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, campaign_id, prospect_id),
  foreign key (campaign_id, tenant_id)
    references public.outreach_campaigns(id, tenant_id) on delete cascade,
  foreign key (prospect_id, tenant_id)
    references public.prospects(id, tenant_id) on delete cascade,
  foreign key (tenant_id, approved_by)
    references public.business_members(tenant_id, user_id) on delete set null
);

create index outreach_messages_tenant_idx
  on public.outreach_messages(tenant_id, campaign_id, status);

create trigger outreach_messages_set_updated_at
before update on public.outreach_messages
for each row execute function public.set_updated_at();

create table public.outreach_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  message_id uuid not null,
  prospect_id uuid not null,
  recipient_email text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'sent', 'skipped', 'failed', 'cancelled')),
  idempotency_key text not null,
  provider text,
  provider_message_id text,
  attempts integer not null default 0 check (attempts between 0 and 5),
  last_error text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key),
  foreign key (message_id, tenant_id)
    references public.outreach_messages(id, tenant_id) on delete cascade,
  foreign key (prospect_id, tenant_id)
    references public.prospects(id, tenant_id) on delete cascade
);

create trigger outreach_outbox_set_updated_at
before update on public.outreach_outbox
for each row execute function public.set_updated_at();

create table public.outreach_replies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  message_id uuid,
  campaign_id uuid,
  prospect_id uuid not null,
  sender_email text,
  subject text,
  body text,
  reply_status text not null default 'unread'
    check (reply_status in ('unread', 'read', 'archived')),
  classification text not null default 'unknown'
    check (classification in ('interested', 'not_interested', 'follow_up_required', 'unsubscribe', 'unknown')),
  provider text not null default 'unknown',
  external_id text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, provider, external_id),
  foreign key (message_id, tenant_id)
    references public.outreach_messages(id, tenant_id) on delete set null,
  foreign key (campaign_id, tenant_id)
    references public.outreach_campaigns(id, tenant_id) on delete set null,
  foreign key (prospect_id, tenant_id)
    references public.prospects(id, tenant_id) on delete cascade
);

create index outreach_replies_tenant_idx
  on public.outreach_replies(tenant_id, received_at desc);

create table public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  email text not null check (length(btrim(email)) between 3 and 255),
  reason text not null check (reason in ('unsubscribe', 'bounced', 'complaint', 'manual')),
  source text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, lower(email)),
  foreign key (tenant_id, created_by)
    references public.business_members(tenant_id, user_id) on delete set null
);

-- ---------------------------------------------------------------------------
-- 4. RLS and table grants
-- ---------------------------------------------------------------------------

alter table public.prospect_searches enable row level security;
alter table public.prospects enable row level security;
alter table public.decision_makers enable row level security;
alter table public.contact_verifications enable row level security;
alter table public.prospect_signals enable row level security;
alter table public.outreach_campaigns enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.outreach_outbox enable row level security;
alter table public.outreach_replies enable row level security;
alter table public.suppression_list enable row level security;

-- Readable by active members only. No direct client writes: every mutation is
-- a trusted RPC that re-checks membership, so RLS cannot be sidestepped by a
-- crafted client payload or by a role/flag stored on the client.
create policy "Sales agent: read searches" on public.prospect_searches
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Sales agent: read prospects" on public.prospects
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Sales agent: read decision makers" on public.decision_makers
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Sales agent: read verifications" on public.contact_verifications
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Sales agent: read signals" on public.prospect_signals
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Sales agent: read campaigns" on public.outreach_campaigns
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Sales agent: read messages" on public.outreach_messages
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Sales agent: read outbox" on public.outreach_outbox
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Sales agent: read replies" on public.outreach_replies
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Sales agent: read suppression" on public.suppression_list
  for select to authenticated using (public.has_tenant_access(tenant_id));

revoke all on public.prospect_searches,
  public.prospects,
  public.decision_makers,
  public.contact_verifications,
  public.prospect_signals,
  public.outreach_campaigns,
  public.outreach_messages,
  public.outreach_outbox,
  public.outreach_replies,
  public.suppression_list from anon;

grant select on public.prospect_searches,
  public.prospects,
  public.decision_makers,
  public.contact_verifications,
  public.prospect_signals,
  public.outreach_campaigns,
  public.outreach_messages,
  public.outreach_outbox,
  public.outreach_replies,
  public.suppression_list to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Member-facing trusted RPCs
-- ---------------------------------------------------------------------------

-- Normalise a website to a comparable key: no scheme, no www., no trailing /.
create or replace function public.sales_normalize_website(p_website text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(btrim(coalesce(p_website, ''))),
          '^https?://', ''),
        '^www\.', ''),
      '/+$', ''),
    '');
$$;

-- Returns an existing prospect id (tenant-scoped) or null. This is the
-- user-facing duplicate check; unique indexes are the authoritative backstop.
create or replace function public.sales_find_duplicate_prospect(
  p_tenant uuid,
  p_email text default null,
  p_website text default null,
  p_business_name text default null,
  p_city text default null,
  p_country text default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_website text := public.sales_normalize_website(p_website);
  v_name text := nullif(lower(btrim(coalesce(p_business_name, ''))), '');
  v_city text := lower(btrim(coalesce(p_city, '')));
  v_country text := lower(btrim(coalesce(p_country, '')));
  v_id uuid;
begin
  if not public.has_tenant_access(p_tenant) then
    return null;
  end if;

  if v_email is not null then
    select id into v_id from public.prospects
    where tenant_id = p_tenant and lower(email) = v_email limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  if v_website is not null then
    select id into v_id from public.prospects
    where tenant_id = p_tenant and lower(website) = v_website limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  if v_name is not null then
    select id into v_id from public.prospects
    where tenant_id = p_tenant
      and lower(btrim(business_name)) = v_name
      and lower(coalesce(city, '')) = v_city
      and lower(coalesce(country, '')) = v_country
    limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  return null;
end;
$$;

create or replace function public.sales_create_prospect(
  p_tenant uuid,
  p_business_name text,
  p_industry text default null,
  p_city text default null,
  p_state text default null,
  p_country text default null,
  p_website text default null,
  p_business_size text default null,
  p_contact_person text default null,
  p_email text default null,
  p_phone text default null,
  p_source text default 'manual',
  p_source_reference uuid default null,
  p_assigned_to uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_duplicate uuid;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_website text := public.sales_normalize_website(p_website);
begin
  if not public.has_tenant_access(p_tenant) then
    raise exception 'No access to this business';
  end if;
  if p_business_name is null or length(btrim(p_business_name)) not between 1 and 200 then
    raise exception 'Business name must be 1 to 200 characters';
  end if;
  if p_source is null or length(btrim(p_source)) not between 1 and 80 then
    raise exception 'Source is required';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if p_assigned_to is not null and not public.is_active_member(p_tenant, p_assigned_to) then
    raise exception 'Assigned employee must be an active member of this business';
  end if;
  if p_source_reference is not null and not exists (
    select 1 from public.prospect_searches
    where id = p_source_reference and tenant_id = p_tenant
  ) then
    raise exception 'Saved search not found';
  end if;

  v_duplicate := public.sales_find_duplicate_prospect(
    p_tenant, v_email, v_website, p_business_name, p_city, p_country
  );
  if v_duplicate is not null then
    raise exception 'A prospect with these details already exists in this business';
  end if;

  insert into public.prospects (
    tenant_id, business_name, industry, city, state, country, website,
    business_size, contact_person, email, phone, source, source_reference,
    assigned_to, created_by, notes
  ) values (
    p_tenant, btrim(p_business_name), nullif(btrim(coalesce(p_industry, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''), nullif(btrim(coalesce(p_state, '')), ''),
    nullif(btrim(coalesce(p_country, '')), ''), v_website,
    nullif(btrim(coalesce(p_business_size, '')), ''),
    nullif(btrim(coalesce(p_contact_person, '')), ''), v_email,
    nullif(btrim(coalesce(p_phone, '')), ''), btrim(p_source), p_source_reference,
    p_assigned_to, (select auth.uid()), nullif(btrim(coalesce(p_notes, '')), '')
  ) returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'sales.prospect_created', 'prospect', v_id::text);
  return v_id;
end;
$$;

create or replace function public.sales_update_prospect(
  p_tenant uuid,
  p_prospect uuid,
  p_business_name text,
  p_industry text default null,
  p_city text default null,
  p_state text default null,
  p_country text default null,
  p_website text default null,
  p_business_size text default null,
  p_contact_person text default null,
  p_email text default null,
  p_phone text default null,
  p_assigned_to uuid default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_website text := public.sales_normalize_website(p_website);
  v_duplicate uuid;
begin
  if not public.has_tenant_access(p_tenant) then
    raise exception 'No access to this business';
  end if;
  if not exists (select 1 from public.prospects where id = p_prospect and tenant_id = p_tenant) then
    raise exception 'Prospect not found';
  end if;
  if p_business_name is null or length(btrim(p_business_name)) not between 1 and 200 then
    raise exception 'Business name must be 1 to 200 characters';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if p_assigned_to is not null and not public.is_active_member(p_tenant, p_assigned_to) then
    raise exception 'Assigned employee must be an active member of this business';
  end if;

  v_duplicate := public.sales_find_duplicate_prospect(
    p_tenant, v_email, v_website, p_business_name, p_city, p_country
  );
  if v_duplicate is not null and v_duplicate <> p_prospect then
    raise exception 'Another prospect with these details already exists in this business';
  end if;

  update public.prospects set
    business_name = btrim(p_business_name),
    industry = nullif(btrim(coalesce(p_industry, '')), ''),
    city = nullif(btrim(coalesce(p_city, '')), ''),
    state = nullif(btrim(coalesce(p_state, '')), ''),
    country = nullif(btrim(coalesce(p_country, '')), ''),
    website = v_website,
    business_size = nullif(btrim(coalesce(p_business_size, '')), ''),
    contact_person = nullif(btrim(coalesce(p_contact_person, '')), ''),
    email = v_email,
    phone = nullif(btrim(coalesce(p_phone, '')), ''),
    assigned_to = p_assigned_to,
    notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = p_prospect and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'sales.prospect_updated', 'prospect', p_prospect::text);
end;
$$;

create or replace function public.sales_set_prospect_lead_status(
  p_tenant uuid,
  p_prospect uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_tenant_access(p_tenant) then
    raise exception 'No access to this business';
  end if;
  if p_status not in ('new', 'contacted', 'qualified', 'unqualified', 'converted') then
    raise exception 'Invalid lead status';
  end if;
  update public.prospects set lead_status = p_status
  where id = p_prospect and tenant_id = p_tenant;
  if not found then raise exception 'Prospect not found'; end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'sales.prospect_lead_status_changed', 'prospect', p_prospect::text);
end;
$$;

create or replace function public.sales_delete_prospect(
  p_tenant uuid,
  p_prospect uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_sales_agent(p_tenant) then
    raise exception 'Only owners and admins can delete prospects';
  end if;
  delete from public.prospects where id = p_prospect and tenant_id = p_tenant;
  if not found then raise exception 'Prospect not found'; end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'sales.prospect_deleted', 'prospect', p_prospect::text);
end;
$$;

create or replace function public.sales_save_search(
  p_tenant uuid,
  p_name text,
  p_criteria jsonb,
  p_provider text default 'manual',
  p_search uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.has_tenant_access(p_tenant) then
    raise exception 'No access to this business';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120 then
    raise exception 'Search name must be 1 to 120 characters';
  end if;
  if p_criteria is null or jsonb_typeof(p_criteria) <> 'object' then
    raise exception 'Search criteria must be an object';
  end if;
  if p_provider not in ('manual', 'google_places', 'other') then
    raise exception 'Invalid discovery provider';
  end if;
  -- A non-manual provider is recorded as a reference only. No provider is
  -- called by this function and no results are fabricated.
  if p_search is null then
    insert into public.prospect_searches (tenant_id, created_by, name, criteria, provider)
    values (p_tenant, (select auth.uid()), btrim(p_name), p_criteria, p_provider)
    returning id into v_id;
  else
    update public.prospect_searches set name = btrim(p_name), criteria = p_criteria
    where id = p_search and tenant_id = p_tenant
    returning id into v_id;
    if v_id is null then raise exception 'Saved search not found'; end if;
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'sales.search_saved', 'prospect_search', v_id::text);
  return v_id;
end;
$$;

-- Batch CSV import. Each row is validated and duplicate-checked in the
-- database; bad rows are skipped rather than aborting the whole file.
create or replace function public.sales_import_prospects(
  p_tenant uuid,
  p_rows jsonb,
  p_source text default 'csv_import'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_index integer;
  v_name text;
  v_email text;
  v_website text;
  v_duplicate uuid;
  v_new_id uuid;
  v_created integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_total integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if not public.has_tenant_access(p_tenant) then
    raise exception 'No access to this business';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows must be an array';
  end if;
  if p_source is null or length(btrim(p_source)) not between 1 and 80 then
    raise exception 'Source is required';
  end if;

  for v_row, v_index in select value, ordinality - 1 from jsonb_array_elements(p_rows) with ordinality
  loop
    v_total := v_total + 1;
    v_name := nullif(btrim(coalesce(v_row->>'business_name', '')), '');
    v_email := nullif(lower(btrim(coalesce(v_row->>'email', ''))), '');
    v_website := public.sales_normalize_website(v_row->>'website');

    begin
      if v_name is null or length(v_name) > 200 then
        raise exception 'Business name is required (max 200 characters)';
      end if;
      if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'Invalid email address';
      end if;

      v_duplicate := public.sales_find_duplicate_prospect(
        p_tenant, v_email, v_website, v_name,
        nullif(btrim(coalesce(v_row->>'city', '')), ''),
        nullif(btrim(coalesce(v_row->>'country', '')), '')
      );
      if v_duplicate is not null then
        v_skipped := v_skipped + 1;
        v_results := v_results || jsonb_build_object(
          'row', v_index, 'business_name', v_name,
          'status', 'duplicate', 'reason', 'Already exists in this business'
        );
        continue;
      end if;

      insert into public.prospects (
        tenant_id, business_name, industry, city, state, country, website,
        business_size, contact_person, email, phone, source, created_by, notes
      ) values (
        p_tenant, v_name,
        nullif(btrim(coalesce(v_row->>'industry', '')), ''),
        nullif(btrim(coalesce(v_row->>'city', '')), ''),
        nullif(btrim(coalesce(v_row->>'state', '')), ''),
        nullif(btrim(coalesce(v_row->>'country', '')), ''),
        v_website,
        nullif(btrim(coalesce(v_row->>'business_size', '')), ''),
        nullif(btrim(coalesce(v_row->>'contact_person', '')), ''),
        v_email,
        nullif(btrim(coalesce(v_row->>'phone', '')), ''),
        btrim(p_source), (select auth.uid()),
        nullif(btrim(coalesce(v_row->>'notes', '')), '')
      ) returning id into v_new_id;

      v_created := v_created + 1;
      v_results := v_results || jsonb_build_object(
        'row', v_index, 'business_name', v_name, 'status', 'created', 'id', v_new_id
      );
    exception when others then
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_object(
        'row', v_index, 'business_name', v_name,
        'status', 'failed', 'reason', left(sqlerrm, 300)
      );
    end;
  end loop;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, (select auth.uid()), 'sales.prospects_imported', 'prospect', null,
    jsonb_build_object('source', btrim(p_source), 'total', v_total,
      'created', v_created, 'duplicate', v_skipped, 'failed', v_failed)
  );

  return jsonb_build_object(
    'total', v_total, 'created', v_created,
    'skipped_duplicate', v_skipped, 'failed', v_failed, 'results', v_results
  );
end;
$$;

-- Real counts over real tables. Returns {} when the caller has no access;
-- the client merges this with an explicit empty shape.
create or replace function public.sales_dashboard_metrics(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_tenant_access(p_tenant) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'total_prospects', (select count(*) from public.prospects where tenant_id = p_tenant),
    'new_prospects', (select count(*) from public.prospects where tenant_id = p_tenant and lead_status = 'new'),
    'verified_contacts', (
      (select count(*) from public.prospects where tenant_id = p_tenant and verification_status = 'verified')
      + (select count(*) from public.decision_makers where tenant_id = p_tenant and verification_status = 'verified')
    ),
    'active_campaigns', (select count(*) from public.outreach_campaigns where tenant_id = p_tenant and status = 'active'),
    'emails_sent', (select count(*) from public.outreach_outbox where tenant_id = p_tenant and status = 'sent'),
    'replies_received', (select count(*) from public.outreach_replies where tenant_id = p_tenant),
    'interested_prospects', (
      select count(distinct prospect_id) from public.outreach_replies
      where tenant_id = p_tenant and classification = 'interested'
    ),
    'converted_customers', (select count(*) from public.prospects where tenant_id = p_tenant and converted_at is not null),
    'saved_searches', (select count(*) from public.prospect_searches where tenant_id = p_tenant)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Function privileges
-- ---------------------------------------------------------------------------

revoke all on function public.can_manage_sales_agent(uuid) from public;
revoke all on function public.sales_is_suppressed(uuid, text) from public;
revoke all on function public.sales_normalize_website(text) from public;
revoke all on function public.sales_find_duplicate_prospect(uuid, text, text, text, text, text) from public;
revoke all on function public.sales_create_prospect(uuid, text, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text) from public;
revoke all on function public.sales_update_prospect(uuid, uuid, text, text, text, text, text, text, text, text, text, text, uuid, text) from public;
revoke all on function public.sales_set_prospect_lead_status(uuid, uuid, text) from public;
revoke all on function public.sales_delete_prospect(uuid, uuid) from public;
revoke all on function public.sales_save_search(uuid, text, jsonb, text, uuid) from public;
revoke all on function public.sales_import_prospects(uuid, jsonb, text) from public;
revoke all on function public.sales_dashboard_metrics(uuid) from public;

grant execute on function public.can_manage_sales_agent(uuid),
  public.sales_is_suppressed(uuid, text),
  public.sales_normalize_website(text),
  public.sales_find_duplicate_prospect(uuid, text, text, text, text, text),
  public.sales_create_prospect(uuid, text, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text),
  public.sales_update_prospect(uuid, uuid, text, text, text, text, text, text, text, text, text, text, uuid, text),
  public.sales_set_prospect_lead_status(uuid, uuid, text),
  public.sales_delete_prospect(uuid, uuid),
  public.sales_save_search(uuid, text, jsonb, text, uuid),
  public.sales_import_prospects(uuid, jsonb, text),
  public.sales_dashboard_metrics(uuid) to authenticated;

commit;
