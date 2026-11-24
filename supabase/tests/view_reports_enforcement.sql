-- ============================================================================
-- view_reports_enforcement.sql
-- Local-only checks for migration 0051. The whole file rolls back.
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
  ('00000000-0000-0000-0000-000000000000', '91111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'reports-owner@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Reports Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '92222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'reports-employee@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Reports Employee"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '93333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'reports-manager@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Reports Manager"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '94444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'reports-platform-admin@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Reports Platform Admin"}', now(), now());

insert into public.platform_admins (user_id, role)
values ('94444444-4444-4444-8444-444444444444', 'super_admin');

select test.act_as('91111111-1111-4111-8111-111111111111', 'reports-owner@example.test');
select public.create_business('Reports Co', 'reports-co', 'salon-spa');

select public.create_business_invitation(
  (select id from public.businesses where slug = 'reports-co'),
  'reports-employee@example.test', 'employee'
);
select public.create_business_invitation(
  (select id from public.businesses where slug = 'reports-co'),
  'reports-manager@example.test', 'manager'
);

do $$
declare v_token text;
begin
  perform test.act_as(null, null, 'service_role');
  select token into v_token from public.business_invitations
  where email = 'reports-employee@example.test' order by created_at desc limit 1;
  perform test.act_as('92222222-2222-4222-8222-222222222222', 'reports-employee@example.test');
  perform public.accept_business_invitation(v_token);

  perform test.act_as(null, null, 'service_role');
  select token into v_token from public.business_invitations
  where email = 'reports-manager@example.test' order by created_at desc limit 1;
  perform test.act_as('93333333-3333-4333-8333-333333333333', 'reports-manager@example.test');
  perform public.accept_business_invitation(v_token);
end;
$$;

do $$
declare
  v_tenant uuid;
  v_result jsonb;
begin
  perform test.act_as(null, null, 'service_role');
  select id into v_tenant from public.businesses where slug = 'reports-co';

  perform test.act_as('91111111-1111-4111-8111-111111111111', 'reports-owner@example.test');
  v_result := public.crm_dashboard_metrics(v_tenant);
  if not v_result ? 'total_contacts' then raise exception 'FAIL: owner could not read CRM report'; end if;
  v_result := public.booking_dashboard_metrics(v_tenant);
  if not v_result ? 'today_count' then raise exception 'FAIL: owner could not read booking report'; end if;
  v_result := public.inbox_metrics(v_tenant);
  if not v_result ? 'open_count' then raise exception 'FAIL: owner could not read inbox report'; end if;
  v_result := public.sales_dashboard_metrics(v_tenant);
  if not v_result ? 'total_prospects' then raise exception 'FAIL: owner could not read sales report'; end if;
  perform public.billing_get_usage(v_tenant);

  perform test.act_as('93333333-3333-4333-8333-333333333333', 'reports-manager@example.test');
  v_result := public.crm_dashboard_metrics(v_tenant);
  if not v_result ? 'total_contacts' then raise exception 'FAIL: manager could not read CRM report'; end if;
  perform public.billing_get_usage(v_tenant);

  perform test.act_as('92222222-2222-4222-8222-222222222222', 'reports-employee@example.test');
  if public.crm_dashboard_metrics(v_tenant) <> '{}'::jsonb then raise exception 'FAIL: employee read CRM report'; end if;
  if public.booking_dashboard_metrics(v_tenant) <> '{}'::jsonb then raise exception 'FAIL: employee read booking report'; end if;
  if public.inbox_metrics(v_tenant) <> '{}'::jsonb then raise exception 'FAIL: employee read inbox report'; end if;
  if public.sales_dashboard_metrics(v_tenant) <> '{}'::jsonb then raise exception 'FAIL: employee read sales report'; end if;
  perform test.expect_error(format('select public.billing_get_usage(%L)', v_tenant));

  perform test.act_as('94444444-4444-4444-8444-444444444444', 'reports-platform-admin@example.test');
  perform public.billing_get_usage(v_tenant);

  raise notice 'PASS: view_reports is enforced server-side for owner, manager, employee and platform admin';
end;
$$;

rollback;
