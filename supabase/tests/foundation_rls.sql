-- ============================================================================
-- foundation_rls.sql
-- Cross-tenant isolation and membership security checks for migration 0001/0002.
--
-- Run against a local Supabase database:
--   psql "$DATABASE_URL" -f supabase/tests/foundation_rls.sql
--
-- The whole file is one transaction and is always rolled back.
-- ============================================================================
\set ON_ERROR_STOP on

begin;

create schema if not exists test;

create or replace function test.act_as(p_user uuid, p_email text)
returns void
language sql
as $$
  select
    set_config('role', 'authenticated', true),
    set_config('request.jwt.claim.sub', p_user::text, true),
    set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated', 'email', p_email)::text, true);
$$;

create or replace function test.expect_error(p_sql text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'FAIL: expected statement to be denied: %', p_sql;
exception when others then
  if sqlerrm like 'FAIL: expected statement to be denied%' then
    raise;
  end if;
  raise notice 'PASS: denied as expected (%)', sqlerrm;
end;
$$;

-- Helpers are called after act_as() switches to the authenticated role, so
-- that role must be allowed to use them.
grant usage on schema test to authenticated;
grant execute on all functions in schema test to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures: three users, one platform admin, two independent businesses
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'owner-a@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Owner A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'owner-b@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Owner B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'employee@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Employee"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'admin@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Platform Admin"}', now(), now());

insert into public.platform_admins (user_id, role)
values ('44444444-4444-4444-8444-444444444444', 'super_admin');

select test.act_as('11111111-1111-4111-8111-111111111111', 'owner-a@example.test');
select public.create_business('Alpha Clinic', 'alpha-clinic', 'dental-clinic');
select public.apply_industry_template((select id from public.businesses where slug = 'alpha-clinic'), 'dental-clinic');

select test.act_as('22222222-2222-4222-8222-222222222222', 'owner-b@example.test');
select public.create_business('Beta Salon', 'beta-salon', 'salon-spa');

-- ---------------------------------------------------------------------------
-- 1. Tenant isolation on reads
-- ---------------------------------------------------------------------------
do $$
declare v_count integer;
begin
  perform test.act_as('11111111-1111-4111-8111-111111111111', 'owner-a@example.test');
  select count(*) into v_count from public.businesses;
  if v_count <> 1 then raise exception 'FAIL: owner A should see 1 business, got %', v_count; end if;

  perform test.act_as('22222222-2222-4222-8222-222222222222', 'owner-b@example.test');
  select count(*) into v_count from public.businesses;
  if v_count <> 1 then raise exception 'FAIL: owner B should see 1 business, got %', v_count; end if;

  select count(*) into v_count
  from public.businesses where slug = 'alpha-clinic';
  if v_count <> 0 then raise exception 'FAIL: owner B must not see tenant A business'; end if;

  raise notice 'PASS: tenant read isolation';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Cross-tenant writes are denied (RLS WITH CHECK)
-- ---------------------------------------------------------------------------
do $$
declare v_tenant_a uuid := (select id from public.businesses where slug = 'alpha-clinic');
begin
  perform test.act_as('22222222-2222-4222-8222-222222222222', 'owner-b@example.test');
  perform test.expect_error(
    format('insert into public.contacts (tenant_id, first_name) values (%L, ''Intruder'')', v_tenant_a)
  );
  raise notice 'PASS: cross-tenant insert denied';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Invitation acceptance is email-bound and grants access
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant_a uuid;
  v_token text;
  v_tenant uuid;
begin
  perform test.act_as('11111111-1111-4111-8111-111111111111', 'owner-a@example.test');
  v_tenant_a := (select id from public.businesses where slug = 'alpha-clinic');
  v_token := public.create_business_invitation(v_tenant_a, 'employee@example.test', 'manager');

  perform test.act_as('33333333-3333-4333-8333-333333333333', 'employee@example.test');
  perform test.expect_error(format('select public.accept_business_invitation(%L)', 'wrong-token'));

  v_tenant := public.accept_business_invitation(v_token);
  if v_tenant <> v_tenant_a then raise exception 'FAIL: invitation returned the wrong tenant'; end if;

  if not public.has_tenant_access(v_tenant_a) then raise exception 'FAIL: employee missing tenant access'; end if;
  raise notice 'PASS: invitation acceptance';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Employees cannot escalate their own role
-- ---------------------------------------------------------------------------
do $$
declare
  v_member_id uuid := (
    select bm.id from public.business_members bm
    join public.profiles p on p.id = bm.user_id
    where p.id = '33333333-3333-4333-8333-333333333333'
  );
  v_role_before text;
  v_role_after text;
begin
  perform test.act_as('33333333-3333-4333-8333-333333333333', 'employee@example.test');
  select role into v_role_before from public.business_members where id = v_member_id;
  -- RLS denies this UPDATE by matching zero rows; it does not raise an error.
  update public.business_members set role = 'owner' where id = v_member_id;
  select role into v_role_after from public.business_members where id = v_member_id;
  if v_role_before <> v_role_after then
    raise exception 'FAIL: self-promotion succeeded (% -> %)', v_role_before, v_role_after;
  end if;
  raise notice 'PASS: self-promotion denied';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Platform data is only visible through admin RPCs
-- ---------------------------------------------------------------------------
do $$
declare
  v_rows integer;
  v_count integer;
begin
  perform test.act_as('22222222-2222-4222-8222-222222222222', 'owner-b@example.test');
  select count(*) into v_rows from public.admin_list_businesses();
  if v_rows <> 0 then raise exception 'FAIL: non-admin must not list all businesses'; end if;

  perform test.act_as('44444444-4444-4444-8444-444444444444', 'admin@example.test');
  select count(*) into v_rows from public.admin_list_businesses();
  if v_rows <> 2 then raise exception 'FAIL: platform admin should see 2 businesses, got %', v_rows; end if;

  begin
    select count(*) into v_count from public.platform_admins;
    raise exception 'FAIL: authenticated users must not read platform_admins';
  exception when insufficient_privilege then
    raise notice 'PASS: platform_admins table denied to authenticated role';
  end;

  raise notice 'PASS: platform admin isolation';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Anonymous role cannot read tenant data
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('role', 'anon', true);
  begin
    perform 1 from public.businesses limit 1;
    raise exception 'FAIL: anon must not read businesses';
  exception when insufficient_privilege then
    raise notice 'PASS: anon denied';
  end;
end;
$$;

rollback;
