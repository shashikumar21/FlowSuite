-- Growth modules: marketing creatives, multi-channel campaigns, website/page
-- records with manual form submissions, and reputation reviews/feedback.
-- NEW tables only; no earlier migration is edited. LOCAL ONLY — not applied
-- to the hosted project.
--
-- Contract:
-- * Browser code has SELECT only on tenant-owned tables. Every write is a
--   SECURITY DEFINER RPC that checks has_tenant_access() first.
-- * Destructive deletes require can_manage_sales_agent() (owner/admin).
-- * A review response is stamped with auth.uid() by the RPC, never by a client.
-- * No provider is called, nothing is sent, no page is hosted and no metric is
--   invented. Empty tables produce genuine zeros.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.growth_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  channel text not null check (channel in ('whatsapp', 'sms', 'ads', 'social', 'email', 'other')),
  objective text not null check (length(btrim(objective)) between 1 and 500),
  status text not null default 'draft'
    check (status in ('draft', 'planned', 'active', 'paused', 'completed', 'cancelled')),
  starts_on date,
  ends_on date,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (tenant_id, created_by)
    references public.business_members(tenant_id, user_id) on delete set null
);

create trigger growth_campaigns_set_updated_at
  before update on public.growth_campaigns
  for each row execute function public.set_updated_at();

create table if not exists public.growth_creatives (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  campaign_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  channel text not null check (channel in ('whatsapp', 'sms', 'ads', 'social', 'email', 'other')),
  headline text,
  message text not null check (length(btrim(message)) between 1 and 2000),
  cta text,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'used', 'archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (campaign_id, tenant_id)
    references public.growth_campaigns(id, tenant_id) on delete cascade,
  foreign key (tenant_id, created_by)
    references public.business_members(tenant_id, user_id) on delete set null
);

create trigger growth_creatives_set_updated_at
  before update on public.growth_creatives
  for each row execute function public.set_updated_at();

create table if not exists public.growth_websites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 1 and 80),
  domain text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, slug),
  foreign key (tenant_id, created_by)
    references public.business_members(tenant_id, user_id) on delete set null
);

create trigger growth_websites_set_updated_at
  before update on public.growth_websites
  for each row execute function public.set_updated_at();

create table if not exists public.growth_form_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  website_id uuid not null,
  full_name text not null check (length(btrim(full_name)) between 1 and 150),
  email text not null check (
    length(btrim(email)) between 3 and 255
    and btrim(email) ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  ),
  message text,
  status text not null default 'new'
    check (status in ('new', 'reviewed', 'archived')),
  recorded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (website_id, tenant_id)
    references public.growth_websites(id, tenant_id) on delete cascade,
  foreign key (tenant_id, recorded_by)
    references public.business_members(tenant_id, user_id) on delete set null
);

create trigger growth_form_submissions_set_updated_at
  before update on public.growth_form_submissions
  for each row execute function public.set_updated_at();

create table if not exists public.growth_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  source text not null check (source in ('google', 'facebook', 'website', 'other')),
  author text not null check (length(btrim(author)) between 1 and 150),
  rating integer not null check (rating between 1 and 5),
  title text,
  body text,
  review_date date,
  status text not null default 'new'
    check (status in ('new', 'reviewed', 'responded', 'archived')),
  response text,
  responded_by uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (tenant_id, responded_by)
    references public.business_members(tenant_id, user_id) on delete set null,
  foreign key (tenant_id, created_by)
    references public.business_members(tenant_id, user_id) on delete set null
);

create trigger growth_reviews_set_updated_at
  before update on public.growth_reviews
  for each row execute function public.set_updated_at();

create table if not exists public.growth_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  source text not null check (source in ('in_person', 'website', 'whatsapp', 'other')),
  customer text not null check (length(btrim(customer)) between 1 and 150),
  rating integer not null check (rating between 1 and 5),
  comment text,
  status text not null default 'new'
    check (status in ('new', 'reviewed', 'archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (tenant_id, created_by)
    references public.business_members(tenant_id, user_id) on delete set null
);

create trigger growth_feedback_set_updated_at
  before update on public.growth_feedback
  for each row execute function public.set_updated_at();

create index growth_campaigns_tenant_idx on public.growth_campaigns(tenant_id, created_at desc);
create index growth_creatives_tenant_idx on public.growth_creatives(tenant_id, campaign_id, created_at desc);
create index growth_websites_tenant_idx on public.growth_websites(tenant_id, created_at desc);
create index growth_submissions_tenant_idx on public.growth_form_submissions(tenant_id, website_id, created_at desc);
create index growth_reviews_tenant_idx on public.growth_reviews(tenant_id, created_at desc);
create index growth_feedback_tenant_idx on public.growth_feedback(tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. RLS and grants — read only for the browser
-- ---------------------------------------------------------------------------

alter table public.growth_campaigns enable row level security;
alter table public.growth_creatives enable row level security;
alter table public.growth_websites enable row level security;
alter table public.growth_form_submissions enable row level security;
alter table public.growth_reviews enable row level security;
alter table public.growth_feedback enable row level security;

create policy "Growth: read campaigns" on public.growth_campaigns
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Growth: read creatives" on public.growth_creatives
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Growth: read websites" on public.growth_websites
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Growth: read submissions" on public.growth_form_submissions
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Growth: read reviews" on public.growth_reviews
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Growth: read feedback" on public.growth_feedback
  for select to authenticated using (public.has_tenant_access(tenant_id));

revoke all on public.growth_campaigns,
  public.growth_creatives,
  public.growth_websites,
  public.growth_form_submissions,
  public.growth_reviews,
  public.growth_feedback from public, anon, authenticated;

grant select on public.growth_campaigns,
  public.growth_creatives,
  public.growth_websites,
  public.growth_form_submissions,
  public.growth_reviews,
  public.growth_feedback to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Campaigns
-- ---------------------------------------------------------------------------

create or replace function public.growth_create_campaign(
  p_tenant uuid,
  p_name text,
  p_channel text,
  p_objective text,
  p_status text,
  p_starts_on date,
  p_ends_on date,
  p_notes text
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
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Invalid campaign name'; end if;
  if length(btrim(coalesce(p_objective, ''))) not between 1 and 500 then raise exception 'Invalid objective'; end if;
  if coalesce(p_channel, '') not in ('whatsapp', 'sms', 'ads', 'social', 'email', 'other') then
    raise exception 'Invalid channel';
  end if;
  if coalesce(p_status, '') not in ('draft', 'planned', 'active', 'paused', 'completed', 'cancelled') then
    raise exception 'Invalid status';
  end if;
  if p_starts_on is not null and p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'End date cannot be before the start date';
  end if;

  insert into public.growth_campaigns (
    tenant_id, name, channel, objective, status, starts_on, ends_on, notes, created_by
  ) values (
    p_tenant, btrim(p_name), p_channel, btrim(p_objective), p_status,
    p_starts_on, p_ends_on, nullif(btrim(coalesce(p_notes, '')), ''), v_caller
  ) returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'growth.campaign_created', 'growth_campaign', v_id::text,
    jsonb_build_object('channel', p_channel, 'status', p_status));
  return v_id;
end;
$$;

create or replace function public.growth_update_campaign(
  p_tenant uuid,
  p_campaign uuid,
  p_name text,
  p_channel text,
  p_objective text,
  p_status text,
  p_starts_on date,
  p_ends_on date,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Invalid campaign name'; end if;
  if length(btrim(coalesce(p_objective, ''))) not between 1 and 500 then raise exception 'Invalid objective'; end if;
  if coalesce(p_channel, '') not in ('whatsapp', 'sms', 'ads', 'social', 'email', 'other') then
    raise exception 'Invalid channel';
  end if;
  if coalesce(p_status, '') not in ('draft', 'planned', 'active', 'paused', 'completed', 'cancelled') then
    raise exception 'Invalid status';
  end if;
  if p_starts_on is not null and p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'End date cannot be before the start date';
  end if;
  if not exists (select 1 from public.growth_campaigns c where c.id = p_campaign and c.tenant_id = p_tenant) then
    raise exception 'Campaign not found in this business';
  end if;

  update public.growth_campaigns
  set name = btrim(p_name), channel = p_channel, objective = btrim(p_objective),
      status = p_status, starts_on = p_starts_on, ends_on = p_ends_on,
      notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = p_campaign and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'growth.campaign_updated', 'growth_campaign', p_campaign::text,
    jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.growth_delete_campaign(p_tenant uuid, p_campaign uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if not public.can_manage_sales_agent(p_tenant) then
    raise exception 'Only an owner or admin can delete a campaign';
  end if;
  if not exists (select 1 from public.growth_campaigns c where c.id = p_campaign and c.tenant_id = p_tenant) then
    raise exception 'Campaign not found in this business';
  end if;
  delete from public.growth_campaigns where id = p_campaign and tenant_id = p_tenant;
  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'growth.campaign_deleted', 'growth_campaign', p_campaign::text, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Marketing creatives
-- ---------------------------------------------------------------------------

create or replace function public.growth_create_creative(
  p_tenant uuid,
  p_campaign uuid,
  p_name text,
  p_channel text,
  p_headline text,
  p_message text,
  p_cta text,
  p_status text
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
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Invalid creative name'; end if;
  if length(btrim(coalesce(p_message, ''))) not between 1 and 2000 then raise exception 'Invalid message'; end if;
  if coalesce(p_channel, '') not in ('whatsapp', 'sms', 'ads', 'social', 'email', 'other') then
    raise exception 'Invalid channel';
  end if;
  if coalesce(p_status, '') not in ('draft', 'ready', 'used', 'archived') then
    raise exception 'Invalid status';
  end if;
  if not exists (select 1 from public.growth_campaigns c where c.id = p_campaign and c.tenant_id = p_tenant) then
    raise exception 'Campaign not found in this business';
  end if;

  insert into public.growth_creatives (
    tenant_id, campaign_id, name, channel, headline, message, cta, status, created_by
  ) values (
    p_tenant, p_campaign, btrim(p_name), p_channel,
    nullif(btrim(coalesce(p_headline, '')), ''), btrim(p_message),
    nullif(btrim(coalesce(p_cta, '')), ''), p_status, v_caller
  ) returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'growth.creative_created', 'growth_creative', v_id::text,
    jsonb_build_object('campaign_id', p_campaign, 'channel', p_channel));
  return v_id;
end;
$$;

create or replace function public.growth_update_creative(
  p_tenant uuid,
  p_creative uuid,
  p_name text,
  p_channel text,
  p_headline text,
  p_message text,
  p_cta text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Invalid creative name'; end if;
  if length(btrim(coalesce(p_message, ''))) not between 1 and 2000 then raise exception 'Invalid message'; end if;
  if coalesce(p_channel, '') not in ('whatsapp', 'sms', 'ads', 'social', 'email', 'other') then
    raise exception 'Invalid channel';
  end if;
  if coalesce(p_status, '') not in ('draft', 'ready', 'used', 'archived') then
    raise exception 'Invalid status';
  end if;
  if not exists (select 1 from public.growth_creatives cr where cr.id = p_creative and cr.tenant_id = p_tenant) then
    raise exception 'Creative not found in this business';
  end if;

  update public.growth_creatives
  set name = btrim(p_name), channel = p_channel,
      headline = nullif(btrim(coalesce(p_headline, '')), ''),
      message = btrim(p_message), cta = nullif(btrim(coalesce(p_cta, '')), ''),
      status = p_status
  where id = p_creative and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'growth.creative_updated', 'growth_creative', p_creative::text,
    jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.growth_delete_creative(p_tenant uuid, p_creative uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if not public.can_manage_sales_agent(p_tenant) then
    raise exception 'Only an owner or admin can delete a creative';
  end if;
  if not exists (select 1 from public.growth_creatives cr where cr.id = p_creative and cr.tenant_id = p_tenant) then
    raise exception 'Creative not found in this business';
  end if;
  delete from public.growth_creatives where id = p_creative and tenant_id = p_tenant;
  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'growth.creative_deleted', 'growth_creative', p_creative::text, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Websites and manually recorded form submissions
-- ---------------------------------------------------------------------------

create or replace function public.growth_create_site(
  p_tenant uuid,
  p_name text,
  p_slug text,
  p_domain text,
  p_status text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_id uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Invalid website name'; end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) not between 1 and 80 then
    raise exception 'Slug must use lowercase letters, numbers and hyphens';
  end if;
  if coalesce(p_status, '') not in ('draft', 'published', 'archived') then
    raise exception 'Invalid status';
  end if;
  if exists (select 1 from public.growth_websites w where w.tenant_id = p_tenant and w.slug = v_slug) then
    raise exception 'This slug is already used in this business';
  end if;

  insert into public.growth_websites (
    tenant_id, name, slug, domain, status, notes, created_by
  ) values (
    p_tenant, btrim(p_name), v_slug,
    nullif(btrim(coalesce(p_domain, '')), ''), p_status,
    nullif(btrim(coalesce(p_notes, '')), ''), v_caller
  ) returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'growth.site_created', 'growth_website', v_id::text,
    jsonb_build_object('slug', v_slug, 'status', p_status));
  return v_id;
end;
$$;

create or replace function public.growth_update_site(
  p_tenant uuid,
  p_site uuid,
  p_name text,
  p_slug text,
  p_domain text,
  p_status text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Invalid website name'; end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) not between 1 and 80 then
    raise exception 'Slug must use lowercase letters, numbers and hyphens';
  end if;
  if coalesce(p_status, '') not in ('draft', 'published', 'archived') then
    raise exception 'Invalid status';
  end if;
  if exists (
    select 1 from public.growth_websites w
    where w.tenant_id = p_tenant and w.slug = v_slug and w.id <> p_site
  ) then
    raise exception 'This slug is already used in this business';
  end if;
  if not exists (select 1 from public.growth_websites w where w.id = p_site and w.tenant_id = p_tenant) then
    raise exception 'Website not found in this business';
  end if;

  update public.growth_websites
  set name = btrim(p_name), slug = v_slug,
      domain = nullif(btrim(coalesce(p_domain, '')), ''),
      status = p_status, notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = p_site and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'growth.site_updated', 'growth_website', p_site::text,
    jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.growth_delete_site(p_tenant uuid, p_site uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if not public.can_manage_sales_agent(p_tenant) then
    raise exception 'Only an owner or admin can delete a website';
  end if;
  if not exists (select 1 from public.growth_websites w where w.id = p_site and w.tenant_id = p_tenant) then
    raise exception 'Website not found in this business';
  end if;
  delete from public.growth_websites where id = p_site and tenant_id = p_tenant;
  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'growth.site_deleted', 'growth_website', p_site::text, '{}'::jsonb);
end;
$$;

create or replace function public.growth_record_submission(
  p_tenant uuid,
  p_site uuid,
  p_full_name text,
  p_email text,
  p_message text,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if length(btrim(coalesce(p_full_name, ''))) not between 1 and 150 then raise exception 'Invalid name'; end if;
  if length(v_email) not between 3 and 255
     or v_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'Invalid email address';
  end if;
  if coalesce(p_status, '') not in ('new', 'reviewed', 'archived') then
    raise exception 'Invalid status';
  end if;
  if not exists (select 1 from public.growth_websites w where w.id = p_site and w.tenant_id = p_tenant) then
    raise exception 'Website not found in this business';
  end if;

  insert into public.growth_form_submissions (
    tenant_id, website_id, full_name, email, message, status, recorded_by
  ) values (
    p_tenant, p_site, btrim(p_full_name), v_email,
    nullif(btrim(coalesce(p_message, '')), ''), p_status, v_caller
  ) returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'growth.submission_recorded', 'growth_submission', v_id::text,
    jsonb_build_object('website_id', p_site));
  return v_id;
end;
$$;

create or replace function public.growth_update_submission(
  p_tenant uuid,
  p_submission uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if coalesce(p_status, '') not in ('new', 'reviewed', 'archived') then
    raise exception 'Invalid status';
  end if;
  if not exists (
    select 1 from public.growth_form_submissions s
    where s.id = p_submission and s.tenant_id = p_tenant
  ) then
    raise exception 'Submission not found in this business';
  end if;

  update public.growth_form_submissions set status = p_status
  where id = p_submission and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'growth.submission_updated', 'growth_submission', p_submission::text,
    jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.growth_delete_submission(p_tenant uuid, p_submission uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if not public.can_manage_sales_agent(p_tenant) then
    raise exception 'Only an owner or admin can delete a submission';
  end if;
  if not exists (
    select 1 from public.growth_form_submissions s
    where s.id = p_submission and s.tenant_id = p_tenant
  ) then
    raise exception 'Submission not found in this business';
  end if;
  delete from public.growth_form_submissions where id = p_submission and tenant_id = p_tenant;
  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'growth.submission_deleted', 'growth_submission', p_submission::text, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Reviews and feedback
-- ---------------------------------------------------------------------------

create or replace function public.growth_record_review(
  p_tenant uuid,
  p_source text,
  p_author text,
  p_rating integer,
  p_title text,
  p_body text,
  p_review_date date,
  p_status text
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
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if length(btrim(coalesce(p_author, ''))) not between 1 and 150 then raise exception 'Invalid author'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Rating must be between 1 and 5'; end if;
  if coalesce(p_source, '') not in ('google', 'facebook', 'website', 'other') then
    raise exception 'Invalid source';
  end if;
  if coalesce(p_status, '') not in ('new', 'reviewed', 'responded', 'archived') then
    raise exception 'Invalid status';
  end if;
  -- Recording has no response argument. A response must go through
  -- growth_update_review so the responder can be stamped by the server.
  if p_status = 'responded' then
    raise exception 'Record the review first, then add a response';
  end if;

  insert into public.growth_reviews (
    tenant_id, source, author, rating, title, body, review_date, status, created_by
  ) values (
    p_tenant, p_source, btrim(p_author), p_rating,
    nullif(btrim(coalesce(p_title, '')), ''),
    nullif(btrim(coalesce(p_body, '')), ''),
    p_review_date, p_status, v_caller
  ) returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'growth.review_recorded', 'growth_review', v_id::text,
    jsonb_build_object('source', p_source, 'rating', p_rating));
  return v_id;
end;
$$;

create or replace function public.growth_update_review(
  p_tenant uuid,
  p_review uuid,
  p_status text,
  p_response text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_response text := nullif(btrim(coalesce(p_response, '')), '');
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if coalesce(p_status, '') not in ('new', 'reviewed', 'responded', 'archived') then
    raise exception 'Invalid status';
  end if;
  if p_status = 'responded' and v_response is null then
    raise exception 'A response is required when marking a review as responded';
  end if;
  if not exists (select 1 from public.growth_reviews r where r.id = p_review and r.tenant_id = p_tenant) then
    raise exception 'Review not found in this business';
  end if;

  -- Only the server records who responded. A client cannot claim another user.
  update public.growth_reviews
  set status = p_status,
      response = coalesce(v_response, response),
      responded_by = case when v_response is not null then v_caller else responded_by end
  where id = p_review and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'growth.review_updated', 'growth_review', p_review::text,
    jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.growth_delete_review(p_tenant uuid, p_review uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if not public.can_manage_sales_agent(p_tenant) then
    raise exception 'Only an owner or admin can delete a review';
  end if;
  if not exists (select 1 from public.growth_reviews r where r.id = p_review and r.tenant_id = p_tenant) then
    raise exception 'Review not found in this business';
  end if;
  delete from public.growth_reviews where id = p_review and tenant_id = p_tenant;
  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'growth.review_deleted', 'growth_review', p_review::text, '{}'::jsonb);
end;
$$;

create or replace function public.growth_record_feedback(
  p_tenant uuid,
  p_source text,
  p_customer text,
  p_rating integer,
  p_comment text,
  p_status text
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
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if length(btrim(coalesce(p_customer, ''))) not between 1 and 150 then raise exception 'Invalid customer'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Rating must be between 1 and 5'; end if;
  if coalesce(p_source, '') not in ('in_person', 'website', 'whatsapp', 'other') then
    raise exception 'Invalid source';
  end if;
  if coalesce(p_status, '') not in ('new', 'reviewed', 'archived') then
    raise exception 'Invalid status';
  end if;

  insert into public.growth_feedback (
    tenant_id, source, customer, rating, comment, status, created_by
  ) values (
    p_tenant, p_source, btrim(p_customer), p_rating,
    nullif(btrim(coalesce(p_comment, '')), ''), p_status, v_caller
  ) returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'growth.feedback_recorded', 'growth_feedback', v_id::text,
    jsonb_build_object('source', p_source, 'rating', p_rating));
  return v_id;
end;
$$;

create or replace function public.growth_update_feedback(
  p_tenant uuid,
  p_feedback uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if coalesce(p_status, '') not in ('new', 'reviewed', 'archived') then
    raise exception 'Invalid status';
  end if;
  if not exists (select 1 from public.growth_feedback f where f.id = p_feedback and f.tenant_id = p_tenant) then
    raise exception 'Feedback not found in this business';
  end if;

  update public.growth_feedback set status = p_status
  where id = p_feedback and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'growth.feedback_updated', 'growth_feedback', p_feedback::text,
    jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.growth_delete_feedback(p_tenant uuid, p_feedback uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if not public.can_manage_sales_agent(p_tenant) then
    raise exception 'Only an owner or admin can delete feedback';
  end if;
  if not exists (select 1 from public.growth_feedback f where f.id = p_feedback and f.tenant_id = p_tenant) then
    raise exception 'Feedback not found in this business';
  end if;
  delete from public.growth_feedback where id = p_feedback and tenant_id = p_tenant;
  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'growth.feedback_deleted', 'growth_feedback', p_feedback::text, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants — Supabase grants anon EXECUTE by default on new functions
-- ---------------------------------------------------------------------------

revoke all on function public.growth_create_campaign(uuid, text, text, text, text, date, date, text) from public, anon;
grant execute on function public.growth_create_campaign(uuid, text, text, text, text, date, date, text) to authenticated;

revoke all on function public.growth_update_campaign(uuid, uuid, text, text, text, text, date, date, text) from public, anon;
grant execute on function public.growth_update_campaign(uuid, uuid, text, text, text, text, date, date, text) to authenticated;

revoke all on function public.growth_delete_campaign(uuid, uuid) from public, anon;
grant execute on function public.growth_delete_campaign(uuid, uuid) to authenticated;

revoke all on function public.growth_create_creative(uuid, uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.growth_create_creative(uuid, uuid, text, text, text, text, text, text) to authenticated;

revoke all on function public.growth_update_creative(uuid, uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.growth_update_creative(uuid, uuid, text, text, text, text, text, text) to authenticated;

revoke all on function public.growth_delete_creative(uuid, uuid) from public, anon;
grant execute on function public.growth_delete_creative(uuid, uuid) to authenticated;

revoke all on function public.growth_create_site(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.growth_create_site(uuid, text, text, text, text, text) to authenticated;

revoke all on function public.growth_update_site(uuid, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.growth_update_site(uuid, uuid, text, text, text, text, text) to authenticated;

revoke all on function public.growth_delete_site(uuid, uuid) from public, anon;
grant execute on function public.growth_delete_site(uuid, uuid) to authenticated;

revoke all on function public.growth_record_submission(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.growth_record_submission(uuid, uuid, text, text, text, text) to authenticated;

revoke all on function public.growth_update_submission(uuid, uuid, text) from public, anon;
grant execute on function public.growth_update_submission(uuid, uuid, text) to authenticated;

revoke all on function public.growth_delete_submission(uuid, uuid) from public, anon;
grant execute on function public.growth_delete_submission(uuid, uuid) to authenticated;

revoke all on function public.growth_record_review(uuid, text, text, integer, text, text, date, text) from public, anon;
grant execute on function public.growth_record_review(uuid, text, text, integer, text, text, date, text) to authenticated;

revoke all on function public.growth_update_review(uuid, uuid, text, text) from public, anon;
grant execute on function public.growth_update_review(uuid, uuid, text, text) to authenticated;

revoke all on function public.growth_delete_review(uuid, uuid) from public, anon;
grant execute on function public.growth_delete_review(uuid, uuid) to authenticated;

revoke all on function public.growth_record_feedback(uuid, text, text, integer, text, text) from public, anon;
grant execute on function public.growth_record_feedback(uuid, text, text, integer, text, text) to authenticated;

revoke all on function public.growth_update_feedback(uuid, uuid, text) from public, anon;
grant execute on function public.growth_update_feedback(uuid, uuid, text) to authenticated;

revoke all on function public.growth_delete_feedback(uuid, uuid) from public, anon;
grant execute on function public.growth_delete_feedback(uuid, uuid) to authenticated;
