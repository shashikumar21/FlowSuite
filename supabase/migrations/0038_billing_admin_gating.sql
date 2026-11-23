-- Billing completion (LOCAL ONLY — not applied to hosted without approval):
-- * super-admin manual plan assignment
-- * usage metering
-- * switch-controlled limit enforcement at the database layer
--
-- Enforcement is OFF by default. Turning it on without an active subscription
-- blocks metered writes, which is intentional but must be an explicit admin act.

-- ---------------------------------------------------------------------------
-- 1. Platform billing settings (single row)
-- ---------------------------------------------------------------------------
create table public.billing_settings (
  id boolean primary key default true check (id),
  enforce_limits boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.billing_settings (id) values (true) on conflict (id) do nothing;

alter table public.billing_settings enable row level security;
-- No policies for authenticated: read and write only through trusted RPCs.
revoke all on table public.billing_settings from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 2. Platform admin: manual plan assignment and enforcement switch
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_tenant_plan(
  p_tenant uuid,
  p_plan uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_tenant_name text;
  v_plan_name text;
  v_subscription uuid;
begin
  if not public.is_platform_admin(array['super_admin']) then
    raise exception 'Super admin access required to assign a plan';
  end if;

  select name into v_tenant_name from public.businesses where id = p_tenant;
  if not found then raise exception 'Business not found'; end if;

  select name into v_plan_name from public.plans where id = p_plan and active = true;
  if not found then raise exception 'Plan not found or inactive'; end if;

  select id into v_subscription
  from public.subscriptions
  where tenant_id = p_tenant
  order by created_at desc
  limit 1;

  if v_subscription is null then
    insert into public.subscriptions (
      tenant_id, plan_id, provider, provider_subscription_id, status, current_period_start, current_period_end
    ) values (
      p_tenant, p_plan, 'manual', null, 'active', now(), null
    );
  else
    update public.subscriptions
    set plan_id = p_plan,
        provider = 'manual',
        provider_subscription_id = null,
        status = 'active',
        current_period_start = now(),
        current_period_end = null
    where id = v_subscription;
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_actor, 'billing.plan_assigned', 'subscription', p_tenant::text,
    jsonb_build_object(
      'plan', v_plan_name,
      'business', v_tenant_name,
      'reason', nullif(btrim(coalesce(p_reason, '')), ''),
      'source', 'platform_admin'
    )
  );
end;
$$;

create or replace function public.admin_set_billing_enforcement(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if not public.is_platform_admin(array['super_admin']) then
    raise exception 'Super admin access required to change billing enforcement';
  end if;
  if p_enabled is null then raise exception 'Enforcement flag is required'; end if;

  update public.billing_settings
  set enforce_limits = p_enabled, updated_at = now(), updated_by = v_actor
  where id = true;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    null, v_actor,
    case when p_enabled then 'billing.enforcement_enabled' else 'billing.enforcement_disabled' end,
    'billing_settings', 'global',
    jsonb_build_object('enforce_limits', p_enabled)
  );

  return jsonb_build_object('enforce_limits', p_enabled, 'updated_at', now());
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Tenant-scoped usage and settings reads
-- ---------------------------------------------------------------------------
create or replace function public.billing_get_usage(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usage jsonb;
begin
  if (select auth.uid()) is null
     or (not public.has_tenant_access(p_tenant)
         and not public.is_platform_admin(array['super_admin'])) then
    raise exception 'Not allowed to view usage for this business';
  end if;

  select jsonb_build_object(
    'contacts', (select count(*)::integer from public.contacts where tenant_id = p_tenant),
    'employees', (select count(*)::integer from public.business_members where tenant_id = p_tenant and status = 'active'),
    'branches', (select count(*)::integer from public.branches where tenant_id = p_tenant),
    'messages', (select count(*)::integer from public.messages where tenant_id = p_tenant and created_at >= date_trunc('month', now())),
    'workflow_runs', (select count(*)::integer from public.workflow_runs where tenant_id = p_tenant and created_at >= date_trunc('month', now())),
    'ai_credits', (select coalesce(sum(total_tokens), 0)::integer from public.ai_usage_logs where tenant_id = p_tenant and created_at >= date_trunc('month', now())),
    'period_start', date_trunc('month', now())
  ) into v_usage;
  return v_usage;
end;
$$;

create or replace function public.billing_get_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'enforce_limits', s.enforce_limits,
    'updated_at', s.updated_at
  )
  from public.billing_settings s
  where s.id = true and (select auth.uid()) is not null;
$$;

-- ---------------------------------------------------------------------------
-- 4. Server-side feature gate (switch-controlled)
-- ---------------------------------------------------------------------------
create or replace function public.billing_enforce_feature(p_tenant uuid, p_feature text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enforce boolean;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to check entitlements for this business';
  end if;

  select enforce_limits into v_enforce from public.billing_settings where id = true;
  if coalesce(v_enforce, false) = false then return true; end if;
  if not public.billing_check_entitlement(p_tenant, p_feature) then
    raise exception 'Feature % is not included in the active plan', p_feature;
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Database-layer limit enforcement trigger
--    Fires on INSERT only. No effect while enforce_limits is false.
-- ---------------------------------------------------------------------------
create or replace function public.billing_enforce_tenant_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enforce boolean;
  v_key text;
  v_value jsonb;
  v_limit integer;
  v_used integer;
  v_increment integer;
begin
  select enforce_limits into v_enforce from public.billing_settings where id = true;
  if coalesce(v_enforce, false) = false then return new; end if;

  v_key := case tg_table_name
    when 'contacts' then 'contacts'
    when 'business_members' then 'employees'
    when 'branches' then 'branches'
    when 'messages' then 'messages'
    when 'workflow_runs' then 'workflow_runs'
    when 'ai_usage_logs' then 'ai_credits'
    else null
  end;
  if v_key is null then return new; end if;
  if tg_op <> 'INSERT' then return new; end if;

  -- Invitations do not consume a seat until accepted, and the first owner of a
  -- new business must be creatable even while enforcement is enabled.
  if tg_table_name = 'business_members' then
    if new.status <> 'active' then return new; end if;
    if new.role = 'owner'
       and not exists (select 1 from public.business_members where tenant_id = new.tenant_id) then
      return new;
    end if;
  end if;

  select p.limits -> v_key into v_value
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.tenant_id = new.tenant_id and s.status = 'active'
  order by s.created_at desc
  limit 1;

  if v_value is null then
    raise exception 'An active subscription is required before this action is allowed';
  end if;
  if jsonb_typeof(v_value) <> 'number' then
    raise exception 'Plan does not define a limit for %', v_key;
  end if;
  v_limit := (v_value #>> '{}')::integer;
  if v_limit < 0 then return new; end if;

  v_used := case v_key
    when 'contacts' then (select count(*)::integer from public.contacts where tenant_id = new.tenant_id)
    when 'employees' then (select count(*)::integer from public.business_members where tenant_id = new.tenant_id and status = 'active')
    when 'branches' then (select count(*)::integer from public.branches where tenant_id = new.tenant_id)
    when 'messages' then (select count(*)::integer from public.messages where tenant_id = new.tenant_id and created_at >= date_trunc('month', now()))
    when 'workflow_runs' then (select count(*)::integer from public.workflow_runs where tenant_id = new.tenant_id and created_at >= date_trunc('month', now()))
    when 'ai_credits' then (select coalesce(sum(total_tokens), 0)::integer from public.ai_usage_logs where tenant_id = new.tenant_id and created_at >= date_trunc('month', now()))
    else 0
  end;
  v_increment := case when v_key = 'ai_credits' then coalesce(new.total_tokens, 0) else 1 end;

  if v_used + v_increment > v_limit then
    raise exception 'Plan limit reached for %. Upgrade your plan to continue.', v_key;
  end if;
  return new;
end;
$$;

drop trigger if exists billing_enforce_contacts_limit on public.contacts;
create trigger billing_enforce_contacts_limit
before insert on public.contacts
for each row execute function public.billing_enforce_tenant_limit();

drop trigger if exists billing_enforce_members_limit on public.business_members;
create trigger billing_enforce_members_limit
before insert on public.business_members
for each row execute function public.billing_enforce_tenant_limit();

drop trigger if exists billing_enforce_branches_limit on public.branches;
create trigger billing_enforce_branches_limit
before insert on public.branches
for each row execute function public.billing_enforce_tenant_limit();

create trigger billing_enforce_messages_limit
before insert on public.messages
for each row execute function public.billing_enforce_tenant_limit();

create trigger billing_enforce_workflow_runs_limit
before insert on public.workflow_runs
for each row execute function public.billing_enforce_tenant_limit();

create trigger billing_enforce_ai_usage_limit
before insert on public.ai_usage_logs
for each row execute function public.billing_enforce_tenant_limit();

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.admin_set_tenant_plan(uuid, uuid, text) from public;
revoke all on function public.admin_set_billing_enforcement(boolean) from public;
revoke all on function public.billing_get_usage(uuid) from public;
revoke all on function public.billing_get_settings() from public;
revoke all on function public.billing_enforce_feature(uuid, text) from public;
revoke all on function public.billing_enforce_tenant_limit() from public;

grant execute on function public.admin_set_tenant_plan(uuid, uuid, text) to authenticated;
grant execute on function public.admin_set_billing_enforcement(boolean) to authenticated;
grant execute on function public.billing_get_usage(uuid) to authenticated;
grant execute on function public.billing_get_settings() to authenticated;
grant execute on function public.billing_enforce_feature(uuid, text) to authenticated;
