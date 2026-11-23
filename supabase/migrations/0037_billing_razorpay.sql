-- Razorpay billing foundation: orders, webhook idempotency and entitlements.
-- This file creates local database objects only. It performs no hosted writes,
-- stores no provider keys, and does not enable hard feature blocking.
-- Entitlement RPCs are advisory primitives that feature code can call later.

-- ---------------------------------------------------------------------------
-- 1. Orders — created only by a signature-verified Edge Function
-- ---------------------------------------------------------------------------
create table public.billing_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  provider text not null default 'razorpay' check (provider = 'razorpay'),
  provider_order_id text not null unique,
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR',
  billing_cycle text not null check (billing_cycle in ('monthly', 'yearly')),
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create index billing_orders_tenant_idx on public.billing_orders(tenant_id, created_at desc);

create trigger billing_orders_set_updated_at
before update on public.billing_orders
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Webhook events — idempotency ledger, service role only
-- ---------------------------------------------------------------------------
create table public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'razorpay',
  provider_event_id text not null unique,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- 3. Tenant-scoped read RPCs
-- ---------------------------------------------------------------------------
create or replace function public.billing_get_overview(p_tenant uuid)
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
    raise exception 'Not allowed to view billing for this business';
  end if;

  select jsonb_build_object(
    'subscription', case when s.id is null then null else jsonb_build_object(
      'id', s.id::text,
      'status', s.status,
      'provider', s.provider,
      'period_start', s.current_period_start,
      'period_end', s.current_period_end,
      'plan', jsonb_build_object(
        'id', p.id::text,
        'name', p.name,
        'description', p.description,
        'price_monthly', p.price_monthly,
        'price_yearly', p.price_yearly,
        'limits', p.limits,
        'features', p.features
      )
    ) end,
    'plans', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', pl.id::text,
          'name', pl.name,
          'description', pl.description,
          'price_monthly', pl.price_monthly,
          'price_yearly', pl.price_yearly,
          'limits', pl.limits,
          'features', pl.features
        ) order by pl.price_monthly, pl.name
      )
      from public.plans pl
      where pl.active = true
    ), '[]'::jsonb),
    'entitlements', case
      when s.id is null or s.status <> 'active' then '{}'::jsonb
      else coalesce(p.features, '{}'::jsonb)
    end,
    'limits', case
      when s.id is null or s.status <> 'active' then '{}'::jsonb
      else coalesce(p.limits, '{}'::jsonb)
    end
  )
  into v_result
  from (select 1 as marker) anchor
  left join lateral (
    select sub.*
    from public.subscriptions sub
    where sub.tenant_id = p_tenant
    order by sub.created_at desc
    limit 1
  ) s on true
  left join public.plans p on p.id = s.plan_id;

  return v_result;
end;
$$;

-- Advisory feature gate. Returns false when there is no active subscription.
create or replace function public.billing_check_entitlement(p_tenant uuid, p_feature text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_value jsonb;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to inspect billing entitlements for this business';
  end if;
  if p_feature is null or btrim(p_feature) = '' then return false; end if;

  select p.features -> btrim(p_feature) into v_value
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.tenant_id = p_tenant and s.status = 'active'
  order by s.created_at desc
  limit 1;

  return v_value = 'true'::jsonb;
end;
$$;

-- Advisory numeric limit gate. p_used is supplied by the trusted caller.
-- Negative plan limits mean unlimited; a missing key means not allowed.
create or replace function public.billing_check_limit(p_tenant uuid, p_key text, p_used integer)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_value jsonb;
  v_limit integer;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to inspect billing limits for this business';
  end if;
  if p_key is null or btrim(p_key) = '' then return false; end if;

  select p.limits -> btrim(p_key) into v_value
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.tenant_id = p_tenant and s.status = 'active'
  order by s.created_at desc
  limit 1;

  if v_value is null or jsonb_typeof(v_value) <> 'number' then return false; end if;
  v_limit := (v_value #>> '{}')::integer;
  if v_limit < 0 then return true; end if;
  return coalesce(p_used, 0) < v_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Service-role RPCs — called only by signature-verified Edge Functions
-- ---------------------------------------------------------------------------
create or replace function public.billing_service_record_order(
  p_tenant uuid,
  p_plan_id uuid,
  p_provider_order_id text,
  p_amount_paise integer,
  p_currency text,
  p_billing_cycle text,
  p_created_by uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required to record a billing order';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'Invalid billing order amount';
  end if;

  insert into public.billing_orders (
    tenant_id, plan_id, provider_order_id, amount_paise, currency, billing_cycle, created_by
  ) values (
    p_tenant, p_plan_id, p_provider_order_id, p_amount_paise, p_currency, p_billing_cycle, p_created_by
  );
end;
$$;

create or replace function public.billing_service_activate_subscription(
  p_tenant uuid,
  p_plan_id uuid,
  p_provider_order_id text,
  p_provider_payment_id text,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.billing_orders%rowtype;
  v_plan_name text;
  v_sub_id uuid;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required to activate a subscription';
  end if;

  select * into v_order
  from public.billing_orders
  where provider_order_id = p_provider_order_id
  for update;
  if not found then raise exception 'Billing order not found'; end if;
  if v_order.tenant_id <> p_tenant then raise exception 'Billing order tenant mismatch'; end if;

  select name into v_plan_name
  from public.plans
  where id = p_plan_id and active = true;
  if not found then raise exception 'Plan is not available for purchase'; end if;

  update public.billing_orders
  set status = 'paid', paid_at = coalesce(paid_at, now()), updated_at = now(), failure_reason = null
  where id = v_order.id and status <> 'paid';

  select id into v_sub_id
  from public.subscriptions
  where provider_subscription_id = p_provider_order_id;

  if v_sub_id is null then
    insert into public.subscriptions (
      tenant_id, plan_id, provider, provider_subscription_id, status, current_period_start, current_period_end
    ) values (
      p_tenant, p_plan_id, 'razorpay', p_provider_order_id, 'active', p_period_start, p_period_end
    )
    returning id into v_sub_id;

    insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      p_tenant, v_order.created_by, 'billing.subscription_activated', 'subscription', v_sub_id::text,
      jsonb_build_object(
        'plan', v_plan_name,
        'order_id', p_provider_order_id,
        'payment_id', p_provider_payment_id,
        'provider', 'razorpay'
      )
    );
  else
    update public.subscriptions
    set plan_id = p_plan_id,
        status = 'active',
        current_period_start = coalesce(p_period_start, current_period_start),
        current_period_end = coalesce(p_period_end, current_period_end)
    where id = v_sub_id;
  end if;

  return v_sub_id;
end;
$$;

create or replace function public.billing_service_mark_order_failed(
  p_provider_order_id text,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required to update a billing order';
  end if;

  update public.billing_orders
  set status = 'failed', failure_reason = left(coalesce(p_error, 'payment_failed'), 300), updated_at = now()
  where provider_order_id = p_provider_order_id and status = 'created';
end;
$$;

create or replace function public.billing_service_record_webhook_event(
  p_provider_event_id text,
  p_event_type text,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required to record a webhook event';
  end if;

  insert into public.billing_webhook_events (provider_event_id, event_type, payload)
  values (p_provider_event_id, p_event_type, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider_event_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function public.billing_service_finish_webhook_event(
  p_provider_event_id text,
  p_status text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required to finish a webhook event';
  end if;

  update public.billing_webhook_events
  set status = p_status, error = left(p_error, 500), processed_at = now()
  where provider_event_id = p_provider_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS and grants
-- ---------------------------------------------------------------------------
alter table public.billing_orders enable row level security;
alter table public.billing_webhook_events enable row level security;

create policy "Billing: members read own orders" on public.billing_orders
for select to authenticated using (public.has_tenant_access(tenant_id));

grant select on public.billing_orders to authenticated;
-- billing_webhook_events is intentionally not granted to authenticated.

revoke all on function public.billing_get_overview(uuid) from public;
revoke all on function public.billing_check_entitlement(uuid, text) from public;
revoke all on function public.billing_check_limit(uuid, text, integer) from public;
grant execute on function public.billing_get_overview(uuid) to authenticated;
grant execute on function public.billing_check_entitlement(uuid, text) to authenticated;
grant execute on function public.billing_check_limit(uuid, text, integer) to authenticated;

revoke all on function public.billing_service_record_order(uuid, uuid, text, integer, text, text, uuid) from public;
revoke all on function public.billing_service_activate_subscription(uuid, uuid, text, text, timestamptz, timestamptz) from public;
revoke all on function public.billing_service_mark_order_failed(text, text) from public;
revoke all on function public.billing_service_record_webhook_event(text, text, jsonb) from public;
revoke all on function public.billing_service_finish_webhook_event(text, text, text) from public;

grant execute on function public.billing_service_record_order(uuid, uuid, text, integer, text, text, uuid) to service_role;
grant execute on function public.billing_service_activate_subscription(uuid, uuid, text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.billing_service_mark_order_failed(text, text) to service_role;
grant execute on function public.billing_service_record_webhook_event(text, text, jsonb) to service_role;
grant execute on function public.billing_service_finish_webhook_event(text, text, text) to service_role;
