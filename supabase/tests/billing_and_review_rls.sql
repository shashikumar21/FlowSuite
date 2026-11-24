-- ============================================================================
-- billing_and_review_rls.sql
-- Local-only security checks for migrations 0037, 0038 and 0039.
--
-- Requires the local database to have all migrations applied, including the
-- local-only billing and review-audit migrations. The whole file rolls back.
-- ============================================================================
\set ON_ERROR_STOP on

begin;

create schema if not exists test;

create or replace function test.act_as(p_user uuid, p_email text, p_role text default 'authenticated')
returns void
language sql
as $$
  select
    set_config('role', p_role, true),
    set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true),
    set_config('request.jwt.claim.role', p_role, true),
    set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', p_role, 'email', p_email)::text, true);
$$;

create or replace function test.expect_error(p_sql text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'FAIL: expected statement to be denied: %', p_sql;
exception when others then
  if sqlerrm like 'FAIL: expected statement to be denied%' then raise; end if;
  raise notice 'PASS: denied as expected (%)', sqlerrm;
end;
$$;

grant usage on schema test to authenticated, service_role;
grant execute on all functions in schema test to authenticated, service_role;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '51111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'billing-owner-a@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Billing Owner A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '52222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'billing-owner-b@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Billing Owner B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '53333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'billing-employee@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Billing Employee"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '54444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'billing-admin@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Billing Platform Admin"}', now(), now());

insert into public.platform_admins (user_id, role)
values ('54444444-4444-4444-8444-444444444444', 'super_admin');

select test.act_as('51111111-1111-4111-8111-111111111111', 'billing-owner-a@example.test');
select public.create_business('Billing Alpha', 'billing-alpha', 'dental-clinic');

select test.act_as('52222222-2222-4222-8222-222222222222', 'billing-owner-b@example.test');
select public.create_business('Billing Beta', 'billing-beta', 'salon-spa');

-- ---------------------------------------------------------------------------
-- 1. Billing reads are tenant scoped
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant_a uuid;
  v_tenant_b uuid;
begin
  perform test.act_as(null, null, 'service_role');
  select id into v_tenant_a from public.businesses where slug = 'billing-alpha';
  select id into v_tenant_b from public.businesses where slug = 'billing-beta';
  perform test.act_as('51111111-1111-4111-8111-111111111111', 'billing-owner-a@example.test');
  perform public.billing_get_overview(v_tenant_a);
  perform public.billing_get_usage(v_tenant_a);
  perform public.billing_get_settings();

  perform test.expect_error(format('select public.billing_get_overview(%L)', v_tenant_b));
  perform test.expect_error(format('select public.billing_get_usage(%L)', v_tenant_b));
  perform test.expect_error(format('select public.billing_check_entitlement(%L, %L)', v_tenant_b, 'ai'));
  raise notice 'PASS: billing reads are tenant scoped';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Billing control tables and service RPCs are not client writable
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant_a uuid;
  v_plan uuid;
begin
  perform test.act_as(null, null, 'service_role');
  select id into v_tenant_a from public.businesses where slug = 'billing-alpha';
  select id into v_plan from public.plans order by price_monthly limit 1;
  perform test.act_as('51111111-1111-4111-8111-111111111111', 'billing-owner-a@example.test');

  begin
    perform 1 from public.billing_settings where id = true;
    raise exception 'FAIL: billing_settings must not be readable by authenticated';
  exception when insufficient_privilege then
    raise notice 'PASS: billing_settings direct read denied';
  end;

  begin
    perform 1 from public.billing_webhook_events limit 1;
    raise exception 'FAIL: webhook ledger must not be readable by authenticated';
  exception when insufficient_privilege then
    raise notice 'PASS: webhook ledger direct read denied';
  end;

  perform test.expect_error(format('update public.billing_settings set enforce_limits = true where id = true'));
  perform test.expect_error(format('select public.admin_set_billing_enforcement(%L)', true));
  perform test.expect_error(format('select public.admin_set_tenant_plan(%L, %L, null)', v_tenant_a, v_plan));
  perform test.expect_error(format(
    'select public.billing_service_activate_subscription(%L, %L, %L, %L, null::timestamptz, null::timestamptz)',
    v_tenant_a, v_plan, 'order-rls-test', 'payment-rls-test'
  ));
  perform test.expect_error(format(
    'insert into public.audit_logs (tenant_id, action, entity_type) values (%L, ''forged'', ''test'')',
    v_tenant_a
  ));
  raise notice 'PASS: billing control writes require trusted roles';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Platform admin can assign a plan and toggle enforcement with audit
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant_a uuid;
  v_plan uuid;
  v_count integer;
begin
  perform test.act_as(null, null, 'service_role');
  select id into v_tenant_a from public.businesses where slug = 'billing-alpha';
  select id into v_plan from public.plans order by price_monthly limit 1;
  perform test.act_as('54444444-4444-4444-8444-444444444444', 'billing-admin@example.test');

  perform public.admin_set_tenant_plan(v_tenant_a, v_plan, 'rls test');

  -- Platform admins are not tenant members, so trusted reads run as service_role.
  perform test.act_as(null, null, 'service_role');
  select count(*) into v_count
  from public.subscriptions
  where tenant_id = v_tenant_a and plan_id = v_plan and provider = 'manual' and status = 'active';
  if v_count <> 1 then raise exception 'FAIL: manual plan assignment did not create one active subscription'; end if;

  select count(*) into v_count
  from public.audit_logs
  where tenant_id = v_tenant_a and action = 'billing.plan_assigned';
  if v_count <> 1 then raise exception 'FAIL: plan assignment was not audited'; end if;

  perform test.act_as('54444444-4444-4444-8444-444444444444', 'billing-admin@example.test');
  perform public.admin_set_billing_enforcement(false);
  perform test.act_as(null, null, 'service_role');
  select count(*) into v_count
  from public.audit_logs
  where action = 'billing.enforcement_disabled';
  if v_count <> 1 then raise exception 'FAIL: enforcement change was not audited'; end if;

  raise notice 'PASS: admin plan assignment and enforcement audit';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Review approval requires manager+ and is audited
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant_a uuid;
  v_token text;
  v_request uuid;
  v_status text;
  v_count integer;
begin
  perform test.act_as(null, null, 'service_role');
  select id into v_tenant_a from public.businesses where slug = 'billing-alpha';
  perform test.act_as('51111111-1111-4111-8111-111111111111', 'billing-owner-a@example.test');
  v_token := public.create_business_invitation(v_tenant_a, 'billing-employee@example.test', 'employee');

  perform test.act_as('53333333-3333-4333-8333-333333333333', 'billing-employee@example.test');
  perform public.accept_business_invitation(v_token);

  -- Review request rows are written by trusted runners; browser roles use RPCs.
  perform test.act_as(null, null, 'service_role');
  insert into public.review_requests (tenant_id, channel, customer_name, customer_phone)
  values (v_tenant_a, 'whatsapp', 'RLS Test Customer', '+911234567890')
  returning id into v_request;

  perform test.act_as('53333333-3333-4333-8333-333333333333', 'billing-employee@example.test');
  perform test.expect_error(format('select public.review_request_set_status(%L, %L, %L)', v_tenant_a, v_request, 'approved'));

  perform test.act_as('51111111-1111-4111-8111-111111111111', 'billing-owner-a@example.test');
  perform public.review_request_set_status(v_tenant_a, v_request, 'approved');

  perform test.act_as(null, null, 'service_role');
  select status into v_status from public.review_requests where id = v_request;
  perform test.act_as('51111111-1111-4111-8111-111111111111', 'billing-owner-a@example.test');
  if v_status <> 'approved' then raise exception 'FAIL: owner approval did not set status'; end if;

  select count(*) into v_count
  from public.audit_logs
  where tenant_id = v_tenant_a
    and action = 'review_request.approved'
    and entity_id = v_request::text;
  if v_count <> 1 then raise exception 'FAIL: review approval was not audited once'; end if;

  raise notice 'PASS: review approval role check and audit';
end;
$$;

rollback;
