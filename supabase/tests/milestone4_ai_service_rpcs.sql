-- ============================================================================
-- milestone4_ai_service_rpcs.sql
-- Focused checks for migration 0015 service-role RPCs used by Edge Functions.
--
-- Hosted Supabase SQL Editor: run with "Run without RLS".
-- Local psql: psql "$DATABASE_URL" -f supabase/tests/milestone4_ai_service_rpcs.sql
-- The whole file is one transaction and is always rolled back.
-- ============================================================================

begin;

create schema if not exists test;

create table test.m4_svc_results (
  id bigint generated always as identity primary key,
  test_name text not null,
  passed boolean not null
);

create or replace function test.act_as(p_user uuid, p_email text)
returns void language sql as $$
  select
    set_config('role', 'authenticated', true),
    set_config('request.jwt.claim.sub', p_user::text, true),
    set_config('request.jwt.claim.role', 'authenticated', true),
    set_config('request.jwt.claims', jsonb_build_object(
      'sub', p_user, 'role', 'authenticated', 'email', p_email
    )::text, true);
$$;

create or replace function test.act_anon()
returns void language sql as $$
  select
    set_config('role', 'anon', true),
    set_config('request.jwt.claim.sub', '', true),
    set_config('request.jwt.claim.role', 'anon', true),
    set_config('request.jwt.claims', '', true);
$$;

create or replace function test.act_service()
returns void language sql as $$
  select
    set_config('role', 'service_role', true),
    set_config('request.jwt.claim.sub', '', true),
    set_config('request.jwt.claim.role', 'service_role', true),
    set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
$$;

create or replace function test.expect_error(p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL: expected statement to be denied: %', p_sql;
exception when others then
  if sqlerrm like 'FAIL: expected statement to be denied%' then raise; end if;
end;
$$;

create or replace function test.svc_assert(p_name text, p_ok boolean)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FAIL: %', p_name;
  end if;
  insert into test.m4_svc_results (test_name, passed) values (p_name, true);
end;
$$;

grant usage on schema test to authenticated, anon, service_role;
grant select, insert on test.m4_svc_results to authenticated, anon, service_role;
grant execute on all functions in schema test to authenticated, anon, service_role;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm4-svc-owner@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"M4 SVC Owner"}', now(), now());

select test.act_as('d1000000-0000-4000-8000-000000000001', 'm4-svc-owner@example.test');
select public.create_business('M4 SVC Clinic', 'm4-svc-clinic', 'dental-clinic');
select public.create_business('M4 SVC Other', 'm4-svc-other', 'dental-clinic');

do $$
declare
  v_a uuid;
  v_b uuid;
  v_agent uuid;
  v_public_key text;
  v_contact uuid;
  v_contact_b uuid;
  v_config jsonb;
  v_active jsonb;
  v_allowed boolean;
  v_consent boolean;
  v_count integer;
begin
  v_a := (select id from public.businesses where slug = 'm4-svc-clinic');
  v_b := (select id from public.businesses where slug = 'm4-svc-other');

  v_agent := public.ai_upsert_agent(
    v_a, 'M4 SVC Agent', 'en', 'friendly', 'Service info.',
    '{}'::jsonb, '{"answer_faq":true}'::jsonb,
    false, null, 'short', 1, 'active'
  );
  select public_key into v_public_key from public.ai_agents where id = v_agent;

  perform test.act_service();
  v_contact := public.ai_upsert_contact_from_channel(v_a, 'whatsapp', 'SVC Customer', '+91 98765 40001', null);
  v_contact_b := public.ai_upsert_contact_from_channel(v_b, 'whatsapp', 'SVC Other', '+91 98765 40002', null);

  -- 1. Service agent lookup includes tenant scope and is not anon-callable.
  v_config := public.ai_service_get_agent(v_public_key);
  perform test.svc_assert('service agent lookup returns tenant', v_config->>'tenant_id' = v_a::text);
  perform test.act_anon();
  perform test.expect_error(format($q$select public.ai_service_get_agent(%L::text)$q$, v_public_key));
  perform test.act_service();

  -- 2. Active-agent lookup is tenant scoped.
  v_active := public.ai_service_get_active_agent(v_a);
  perform test.svc_assert('service active-agent lookup matches agent', v_active->>'agent_id' = v_agent::text);

  -- 3. Usage limit is enforced from authoritative logs.
  v_allowed := public.ai_service_check_usage_limit(v_a, v_agent);
  perform test.svc_assert('usage allowed before tokens are logged', v_allowed);
  insert into public.ai_usage_logs (
    tenant_id, agent_id, channel, provider, operation, prompt_tokens, completion_tokens, total_tokens
  ) values (v_a, v_agent, 'website_chat', 'openai', 'chat', 2, 0, 2);
  v_allowed := public.ai_service_check_usage_limit(v_a, v_agent);
  perform test.svc_assert('usage denied after token limit is reached', not v_allowed);

  -- 4. Consent writes and opt-out checks are tenant scoped.
  perform public.ai_service_set_consent(v_a, v_contact, 'whatsapp', 'opt_in', 'website_chat', '{}'::jsonb);
  v_consent := public.has_consent(v_a, v_contact, 'whatsapp');
  perform test.svc_assert('service opt-in is visible to has_consent', v_consent);
  perform public.ai_service_set_consent(v_a, v_contact, 'whatsapp', 'opt_out', 'website_chat', '{}'::jsonb);
  v_consent := public.has_consent(v_a, v_contact, 'whatsapp');
  perform test.svc_assert('service opt-out blocks consent', not v_consent);
  perform test.expect_error(format(
    $q$select public.ai_service_set_consent(%L::uuid, %L::uuid, 'whatsapp', 'opt_in', 'website_chat', '{}'::jsonb)$q$,
    v_a, v_contact_b
  ));
  perform test.svc_assert('cross-tenant consent write is rejected', true);

  select count(*) into v_count from public.ai_usage_logs where tenant_id = v_a and agent_id = v_agent;
  perform test.svc_assert('usage log fixture exists', v_count = 1);
end;
$$;

select count(*) as checks_passed from test.m4_svc_results where passed;

rollback;
