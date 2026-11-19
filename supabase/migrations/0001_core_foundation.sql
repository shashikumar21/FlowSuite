-- ============================================================================
-- 0001_core_foundation.sql
-- FlowSuite / AI Business OS — multi-tenant foundation
-- One business = one tenant. Every tenant-owned row carries tenant_id.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Identity — profiles are created by a trusted Auth trigger
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone, locale)
  values (
    new.id,
    nullif(coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)), ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'locale', ''), 'en')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Businesses / tenants
-- ---------------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  industry text not null,
  email text,
  phone text,
  website text,
  country_code text not null default 'IN',
  currency text not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger businesses_set_updated_at
before update on public.businesses
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Team memberships
-- ---------------------------------------------------------------------------
create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'employee' check (role in ('owner', 'admin', 'manager', 'employee')),
  status text not null default 'active' check (status in ('invited', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  unique (id, tenant_id)
);

create index business_members_user_idx on public.business_members(user_id, tenant_id);
create index business_members_tenant_idx on public.business_members(tenant_id, status);

-- ---------------------------------------------------------------------------
-- 4. Platform admins — completely separate from tenant roles
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin', 'support')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. Subscription plans
-- ---------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  price_monthly numeric(12, 2) not null default 0,
  price_yearly numeric(12, 2) not null default 0,
  limits jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. Subscriptions — writes are server-only
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  provider text not null default 'razorpay',
  provider_subscription_id text unique,
  status text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'cancelled', 'expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create index subscriptions_tenant_idx on public.subscriptions(tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 7. Invitations — shareable token, accepted through a trusted RPC
-- ---------------------------------------------------------------------------
create table public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'manager', 'employee')),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  invited_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create index business_invitations_token_idx on public.business_invitations(token);
create index business_invitations_tenant_idx on public.business_invitations(tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 8. Audit log — immutable from the client
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.businesses(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_tenant_idx on public.audit_logs(tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 9. CRM core tables (created now so RLS is tested before the CRM UI exists)
-- ---------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  first_name text not null,
  last_name text,
  email text,
  phone text,
  source text,
  status text not null default 'lead' check (status in ('lead', 'customer', 'inactive')),
  assigned_to uuid references public.profiles(id) on delete set null,
  custom_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create index contacts_tenant_idx on public.contacts(tenant_id, created_at desc);
create index contacts_phone_idx on public.contacts(tenant_id, phone);
create index contacts_assigned_idx on public.contacts(tenant_id, assigned_to);

create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  pipeline_id uuid not null,
  name text not null,
  position integer not null default 0,
  probability integer not null default 0 check (probability between 0 and 100),
  foreign key (pipeline_id, tenant_id) references public.pipelines(id, tenant_id) on delete cascade,
  unique (id, tenant_id)
);

create index pipeline_stages_pipeline_idx on public.pipeline_stages(tenant_id, pipeline_id, position);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contact_id uuid not null,
  pipeline_id uuid not null,
  stage_id uuid not null,
  title text not null,
  value numeric(14, 2) not null default 0,
  currency text not null default 'INR',
  assigned_to uuid references public.profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'won', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (contact_id, tenant_id) references public.contacts(id, tenant_id) on delete cascade,
  foreign key (pipeline_id, tenant_id) references public.pipelines(id, tenant_id) on delete cascade,
  foreign key (stage_id, tenant_id) references public.pipeline_stages(id, tenant_id),
  unique (id, tenant_id)
);

create index deals_tenant_idx on public.deals(tenant_id, status, created_at desc);

create trigger deals_set_updated_at
before update on public.deals
for each row execute function public.set_updated_at();

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  foreign key (contact_id, tenant_id) references public.contacts(id, tenant_id) on delete set null,
  unique (id, tenant_id)
);

create index appointments_tenant_start_idx on public.appointments(tenant_id, start_at);

create trigger appointments_set_updated_at
before update on public.appointments
for each row execute function public.set_updated_at();

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid,
  channel text not null,
  status text not null default 'open' check (status in ('open', 'closed', 'pending')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (contact_id, tenant_id) references public.contacts(id, tenant_id) on delete set null,
  unique (id, tenant_id)
);

create index conversations_tenant_idx on public.conversations(tenant_id, status, updated_at desc);

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  conversation_id uuid not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  content text,
  provider_message_id text,
  delivery_status text not null default 'pending',
  created_at timestamptz not null default now(),
  foreign key (conversation_id, tenant_id) references public.conversations(id, tenant_id) on delete cascade,
  unique (id, tenant_id)
);

create index messages_conversation_idx on public.messages(tenant_id, conversation_id, created_at);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  title text not null,
  description text,
  assigned_to uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create index tasks_tenant_idx on public.tasks(tenant_id, status, due_at);

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 10. Authorisation helpers — security definer, pinned search_path
-- ---------------------------------------------------------------------------
create or replace function public.has_tenant_access(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members bm
    where bm.tenant_id = target_tenant
      and bm.user_id = (select auth.uid())
      and bm.status = 'active'
  );
$$;

create or replace function public.has_tenant_role(target_tenant uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members bm
    where bm.tenant_id = target_tenant
      and bm.user_id = (select auth.uid())
      and bm.status = 'active'
      and bm.role = any(allowed_roles)
  );
$$;

create or replace function public.is_platform_admin(allowed_roles text[] default array['super_admin', 'support'])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = (select auth.uid())
      and pa.role = any(allowed_roles)
  );
$$;

-- ---------------------------------------------------------------------------
-- 11. Trusted provisioning / membership RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_business(
  p_name text,
  p_slug text,
  p_industry text,
  p_email text default null,
  p_phone text default null,
  p_timezone text default 'Asia/Kolkata',
  p_currency text default 'INR'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_tenant uuid;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Business name is required';
  end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid business slug';
  end if;
  if nullif(btrim(p_industry), '') is null then
    raise exception 'Industry is required';
  end if;

  insert into public.profiles (id, full_name)
  select v_user, nullif(split_part(coalesce(u.email, ''), '@', 1), '')
  from auth.users u
  where u.id = v_user
  on conflict (id) do nothing;

  insert into public.businesses (name, slug, industry, email, phone, timezone, currency)
  values (
    btrim(p_name),
    lower(p_slug),
    p_industry,
    nullif(btrim(coalesce(p_email, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    p_timezone,
    p_currency
  )
  returning id into v_tenant;

  insert into public.business_members (tenant_id, user_id, role, status)
  values (v_tenant, v_user, 'owner', 'active');

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_tenant, v_user, 'business.created', 'business', v_tenant::text, jsonb_build_object('slug', lower(p_slug)));

  return v_tenant;
end;
$$;

create or replace function public.create_business_invitation(
  p_tenant_id uuid,
  p_email text,
  p_role text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_caller uuid := (select auth.uid());
begin
  if not public.has_tenant_role(p_tenant_id, array['owner', 'admin']) then
    raise exception 'Only owners and admins can invite team members';
  end if;
  if p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Invalid email address';
  end if;
  if p_role not in ('admin', 'manager', 'employee') then
    raise exception 'Invalid role';
  end if;

  insert into public.business_invitations (tenant_id, email, role, invited_by, expires_at)
  values (p_tenant_id, lower(btrim(p_email)), p_role, v_caller, now() + interval '7 days')
  on conflict (tenant_id, email) do update
    set role = excluded.role,
        token = replace(gen_random_uuid()::text, '-', ''),
        invited_by = excluded.invited_by,
        expires_at = excluded.expires_at,
        accepted_at = null,
        created_at = now()
  returning token into v_token;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant_id, v_caller, 'invitation.created', 'invitation', v_token, jsonb_build_object('role', p_role));

  return v_token;
end;
$$;

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
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_inv
  from public.business_invitations i
  where i.token = p_token
    and i.accepted_at is null
    and i.expires_at > now();

  if not found then
    raise exception 'Invitation not found or expired';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_caller;
  if v_email is null or v_email <> v_inv.email then
    raise exception 'This invitation was sent to a different email address';
  end if;

  -- Allows this trusted flow to update the invitee's own membership row.
  perform set_config('app.invitation_accept', 'true', true);

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

  update public.business_invitations i
  set accepted_at = now()
  where i.id = v_inv.id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_inv.tenant_id, v_caller, 'invitation.accepted', 'invitation', v_inv.id::text, '{}'::jsonb);

  return v_inv.tenant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Platform admin RPCs (the only way to read across tenants)
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_businesses()
returns table (
  id uuid,
  name text,
  slug text,
  industry text,
  status text,
  plan_name text,
  subscription_status text,
  member_count bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    b.name,
    b.slug,
    b.industry,
    b.status,
    p.name,
    s.status,
    (select count(*) from public.business_members bm where bm.tenant_id = b.id and bm.status = 'active'),
    b.created_at
  from public.businesses b
  left join lateral (
    select sub.* from public.subscriptions sub
    where sub.tenant_id = b.id
    order by sub.created_at desc
    limit 1
  ) s on true
  left join public.plans p on p.id = s.plan_id
  where public.is_platform_admin(array['super_admin']);
$$;

create or replace function public.admin_list_plans()
returns setof public.plans
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.plans p
  where public.is_platform_admin(array['super_admin'])
  order by p.price_monthly;
$$;

create or replace function public.admin_platform_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_platform_admin(array['super_admin']) then jsonb_build_object(
      'businesses_total', (select count(*) from public.businesses),
      'businesses_active', (select count(*) from public.businesses where status = 'active'),
      'subscriptions_active', (select count(*) from public.subscriptions where status = 'active'),
      'mrr', (
        select coalesce(sum(p.price_monthly), 0)
        from public.subscriptions s
        join public.plans p on p.id = s.plan_id
        where s.status = 'active'
      ),
      'members_total', (select count(*) from public.business_members where status = 'active')
    )
    else '{}'::jsonb
  end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Membership invariants — no self-promotion, no orphaned owner
-- ---------------------------------------------------------------------------
create or replace function public.protect_membership_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_platform_admin boolean := public.is_platform_admin(array['super_admin']);
  v_active_owners integer;
begin
  if coalesce(current_setting('app.invitation_accept', true), '') = 'true' then
    if tg_op = 'DELETE' then return old; end if;
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

create trigger business_members_protect_changes
before insert or update or delete on public.business_members
for each row execute function public.protect_membership_changes();

-- ---------------------------------------------------------------------------
-- 14. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.platform_admins enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.business_invitations enable row level security;
alter table public.audit_logs enable row level security;
alter table public.contacts enable row level security;
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.deals enable row level security;
alter table public.appointments enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.tasks enable row level security;

-- Profiles
create policy "Users read own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Members read coworker profiles"
  on public.profiles for select to authenticated
  using (
    exists (
      select 1
      from public.business_members mine
      join public.business_members theirs on theirs.tenant_id = mine.tenant_id
      where mine.user_id = (select auth.uid())
        and mine.status = 'active'
        and theirs.user_id = profiles.id
    )
  );

create policy "Users update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Businesses
create policy "Members read their businesses"
  on public.businesses for select to authenticated
  using (public.has_tenant_access(id));

create policy "Owners and admins update their business"
  on public.businesses for update to authenticated
  using (public.has_tenant_role(id, array['owner', 'admin']))
  with check (public.has_tenant_role(id, array['owner', 'admin']));

-- Memberships
create policy "Members view team"
  on public.business_members for select to authenticated
  using (public.has_tenant_access(tenant_id));

create policy "Owners and admins manage team"
  on public.business_members for all to authenticated
  using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
  with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

-- Plans and subscriptions
create policy "Authenticated users view active plans"
  on public.plans for select to authenticated
  using (active = true);

create policy "Members read their subscription"
  on public.subscriptions for select to authenticated
  using (public.has_tenant_access(tenant_id));

-- Invitations
create policy "Admins view invitations"
  on public.business_invitations for select to authenticated
  using (public.has_tenant_role(tenant_id, array['owner', 'admin']));

create policy "Admins create invitations"
  on public.business_invitations for insert to authenticated
  with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

create policy "Admins revoke invitations"
  on public.business_invitations for delete to authenticated
  using (public.has_tenant_role(tenant_id, array['owner', 'admin']));

-- Audit log (read-only for tenant admins and platform admins)
create policy "Admins read audit log"
  on public.audit_logs for select to authenticated
  using (
    (tenant_id is not null and public.has_tenant_role(tenant_id, array['owner', 'admin']))
    or public.is_platform_admin(array['super_admin'])
  );

-- Tenant-owned CRM records
create policy "Tenant contacts access" on public.contacts for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));
create policy "Tenant pipelines access" on public.pipelines for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));
create policy "Tenant stages access" on public.pipeline_stages for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));
create policy "Tenant deals access" on public.deals for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));
create policy "Tenant appointments access" on public.appointments for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));
create policy "Tenant conversations access" on public.conversations for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));
create policy "Tenant messages access" on public.messages for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));
create policy "Tenant tasks access" on public.tasks for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));

-- No policies on platform_admins: authenticated/anon cannot read or write it directly.

-- ---------------------------------------------------------------------------
-- 15. Grants — explicit least privilege
-- ---------------------------------------------------------------------------
revoke all on public.profiles,
  public.businesses,
  public.business_members,
  public.business_invitations,
  public.plans,
  public.subscriptions,
  public.audit_logs,
  public.contacts,
  public.pipelines,
  public.pipeline_stages,
  public.deals,
  public.appointments,
  public.conversations,
  public.messages,
  public.tasks
  from anon;

revoke all on public.platform_admins from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, update on public.businesses to authenticated;
grant select, insert, update, delete on public.business_members to authenticated;
grant select, insert, delete on public.business_invitations to authenticated;
grant select on public.plans, public.subscriptions, public.audit_logs to authenticated;
grant select, insert, update, delete on public.contacts,
  public.pipelines,
  public.pipeline_stages,
  public.deals,
  public.appointments,
  public.conversations,
  public.messages,
  public.tasks to authenticated;

-- RPCs: callable only by authenticated users (trigger helpers stay internal)
revoke all on function public.handle_new_user() from public;
revoke all on function public.protect_membership_changes() from public;
revoke all on function public.set_updated_at() from public;
revoke all on function public.has_tenant_access(uuid) from public;
revoke all on function public.has_tenant_role(uuid, text[]) from public;
revoke all on function public.is_platform_admin(text[]) from public;
revoke all on function public.create_business(text, text, text, text, text, text, text) from public;
revoke all on function public.create_business_invitation(uuid, text, text) from public;
revoke all on function public.accept_business_invitation(text) from public;
revoke all on function public.admin_list_businesses() from public;
revoke all on function public.admin_list_plans() from public;
revoke all on function public.admin_platform_stats() from public;

grant execute on function public.has_tenant_access(uuid) to authenticated;
grant execute on function public.has_tenant_role(uuid, text[]) to authenticated;
grant execute on function public.is_platform_admin(text[]) to authenticated;
grant execute on function public.create_business(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.create_business_invitation(uuid, text, text) to authenticated;
grant execute on function public.accept_business_invitation(text) to authenticated;
grant execute on function public.admin_list_businesses() to authenticated;
grant execute on function public.admin_list_plans() to authenticated;
grant execute on function public.admin_platform_stats() to authenticated;

-- Authenticated users may read their own auth user row (needed by invitation RPC)
-- but never via a direct table grant; the RPC is security definer.
