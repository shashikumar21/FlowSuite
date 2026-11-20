-- ============================================================================
-- milestone4_ai_qualification_rpcs.sql
-- Focused checks for migration 0016 service-role qualification and follow-up
-- enqueue RPCs. Assumes migrations 0015 and 0016 are applied.
--
-- Hosted Supabase SQL Editor: run with "Run without RLS".
-- Local psql: psql "$DATABASE_URL" -f supabase/tests/milestone4_ai_qualification_rpcs.sql
-- The whole file is one transaction and is always rolled back.
-- ============================================================================

begin;

create schema if not exists test;

create table test.m4_qual_results (
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

create or replace function test.qual_assert(p_name text, p_ok boolean)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FAIL: %', p_name;
  end if;
  insert into test.m4_qual_results (test_name, passed) values (p_name, true);
end;
$$;

grant usage on schema test to authenticated, anon, service_role;
grant select, insert on test.m4_qual_results to authenticated, anon, service_role;
grant execute on all functions in schema test to authenticated, anon, service_role;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm4-qual-owner@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"M4 Qual Owner"}', now(), now());

select test.act_as('e1000000-0000-4000-8000-000000000001', 'm4-qual-owner@example.test');
select public.create_business('M4 Qual Clinic', 'm4-qual-clinic', 'dental-clinic');
select public.create_business('M4 Qual Other', 'm4-qual-other', 'dental-clinic');

do $$
declare
  v_a uuid;
  v_b uuid;
  v_contact uuid;
  v_contact_b uuid;
  v_sequence uuid;
  v_assessment uuid;
  v_job uuid;
  v_job_again uuid;
  v_count integer;
begin
  v_a := (select id from public.businesses where slug = 'm4-qual-clinic');
  v_b := (select id from public.businesses where slug = 'm4-qual-other');

  select test.act_service();

  insert into public.contacts (tenant_id, first_name, phone, source)
  values (v_a, 'Qual Customer', '+919876540001', 'website_chat') returning id into v_contact;
  insert into public.contacts (tenant_id, first_name, phone, source)
  values (v_b, 'Other Customer', '+919876540002', 'website_chat') returning id into v_contact_b;

  insert into public.ai_follow_up_sequences (tenant_id, name, channel, status)
  values (v_a, 'Qual follow-up', 'whatsapp', 'active') returning id into v_sequence;
  insert into public.ai_follow_up_steps (tenant_id, sequence_id, step_index, delay_minutes, template_key)
  values (v_a, v_sequence, 1, 60, 'qual_follow_up');

  -- 1. Service role records only allowlisted classifications.
  v_assessment := public.ai_service_record_assessment(
    v_a, v_contact, 'future_follow_up', 'Customer wants to book next week.',
    'booking', 'cleaning', null, null, null, 'openai', 'gpt-4o-mini'
  );
  perform test.qual_assert('valid assessment is recorded', v_assessment is not null);

  perform test.expect_error(format(
    $q$select public.ai_service_record_assessment(%L::uuid, %L::uuid, 'hot_lead', 'Invented score', null, null, null, null, null, null, null)$q$,
    v_a, v_contact
  ));
  perform test.qual_assert('invented classification is rejected', true);

  perform test.expect_error(format(
    $q$select public.ai_service_record_assessment(%L::uuid, %L::uuid, 'high_intent', 'Cross tenant', null, null, null, null, null, null, null)$q$,
    v_a, v_contact_b
  ));
  perform test.qual_assert('cross-tenant assessment is rejected', true);

  -- 2. Follow-up enqueue is consent-gated.
  perform test.expect_error(format(
    $q$select public.ai_service_enqueue_follow_up(%L::uuid, %L::uuid, %L::uuid, 'whatsapp', null)$q$,
    v_a, v_contact, v_sequence
  ));
  perform test.qual_assert('follow-up without consent is rejected', true);

  perform public.ai_service_set_consent(
    v_a, v_contact, 'whatsapp', 'opt_in', 'website_chat', '{}'::jsonb
  );
  v_job := public.ai_service_enqueue_follow_up(v_a, v_contact, v_sequence, 'whatsapp', null);
  perform test.qual_assert('consented follow-up is queued', v_job is not null);

  -- 3. Enqueue is idempotent per tenant/sequence/contact.
  v_job_again := public.ai_service_enqueue_follow_up(v_a, v_contact, v_sequence, 'whatsapp', null);
  perform test.qual_assert('follow-up enqueue is idempotent', v_job = v_job_again);

  -- 4. Sequence channel must match the requested channel.
  perform test.expect_error(format(
    $q$select public.ai_service_enqueue_follow_up(%L::uuid, %L::uuid, %L::uuid, 'email', null)$q$,
    v_a, v_contact, v_sequence
  ));
  perform test.qual_assert('mismatched follow-up channel is rejected', true);

  -- 5. After opt-out, no new enqueue is allowed.
  perform public.ai_service_set_consent(
    v_a, v_contact, 'whatsapp', 'opt_out', 'website_chat', '{}'::jsonb
  );
  perform test.expect_error(format(
    $q$select public.ai_service_enqueue_follow_up(%L::uuid, %L::uuid, %L::uuid, 'whatsapp', null)$q$,
    v_a, v_contact, v_sequence
  ));
  perform test.qual_assert('opt-out blocks new follow-ups', true);

  -- 6. Anonymous callers can never invoke these RPCs.
  select count(*) into v_count from public.ai_lead_assessments where tenant_id = v_a;
  perform test.qual_assert('assessment rows exist for fixtures', v_count = 1);

  select test.act_anon();
  perform test.expect_error(format(
    $q$select public.ai_service_record_assessment(%L::uuid, %L::uuid, 'high_intent', 'Anon', null, null, null, null, null, null, null)$q$,
    v_a, v_contact
  ));
  perform test.qual_assert('anonymous assessment write is denied', true);
  perform test.expect_error(format(
    $q$select public.ai_service_enqueue_follow_up(%L::uuid, %L::uuid, %L::uuid, 'whatsapp', null)$q$,
    v_a, v_contact, v_sequence
  ));
  perform test.qual_assert('anonymous follow-up enqueue is denied', true);
end;
$$;

select count(*) as checks_passed from test.m4_qual_results where passed;

rollback;
