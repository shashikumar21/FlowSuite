-- ============================================================================
-- review_rating_followup.sql
-- Local-only behavior checks for migration 0041. Runs in one rolled-back
-- transaction. Requires a local database with all migrations through 0041.
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

grant usage on schema test to authenticated, anon, service_role;
grant execute on all functions in schema test to authenticated, anon, service_role;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '71111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'rating-owner-a@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Rating Owner A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '72222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'rating-owner-b@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Rating Owner B"}', now(), now());

select test.act_as('71111111-1111-4111-8111-111111111111', 'rating-owner-a@example.test');
select public.create_business('Rating Clinic A', 'rating-clinic-a', 'dental-clinic');
select test.act_as('72222222-2222-4222-8222-222222222222', 'rating-owner-b@example.test');
select public.create_business('Rating Clinic B', 'rating-clinic-b', 'dental-clinic');

-- Cross-tenant fixtures are inserted with the trusted role; browser roles stay isolated.
select test.act_as(null, null, 'service_role');

insert into public.review_requests (tenant_id, customer_name, channel, review_link_type, status, public_token)
select b.id, 'Happy Customer', 'whatsapp', 'flowsuite', 'pending_approval', 'rating-token-a'
from public.businesses b where b.slug = 'rating-clinic-a';

insert into public.review_requests (tenant_id, customer_name, channel, review_link_type, status, public_token)
select b.id, 'Other Tenant Customer', 'whatsapp', 'flowsuite', 'pending_approval', 'rating-token-b'
from public.businesses b where b.slug = 'rating-clinic-b';

-- 1. Public rating creates exactly one internal follow-up in the right tenant.
do $$
declare
  v_tenant_a uuid;
  v_tenant_b uuid;
  v_request uuid;
  v_result jsonb;
  v_tasks_a integer;
  v_tasks_b integer;
  v_notices_a integer;
  v_notices_b integer;
  v_audits integer;
  v_messages integer;
begin
  perform test.act_as(null, null, 'service_role');
  select id into v_tenant_a from public.businesses where slug = 'rating-clinic-a';
  select id into v_tenant_b from public.businesses where slug = 'rating-clinic-b';
  perform test.act_as(null, null, 'anon');
  v_result := public.public_review_submit_feedback('rating-token-a', 5, 'Great service!');
  v_request := (v_result ->> 'id')::uuid;

  if coalesce((v_result ->> 'follow_up_task_created')::boolean, false) is not true then
    raise exception 'FAIL: expected first submission to create a follow-up task';
  end if;

  -- Verification reads run with the trusted role; only the public RPC ran as anon.
  perform test.act_as(null, null, 'service_role');

  select count(*) into v_tasks_a from public.tasks where tenant_id = v_tenant_a;
  select count(*) into v_tasks_b from public.tasks where tenant_id = v_tenant_b;
  select count(*) into v_notices_a from public.notifications where tenant_id = v_tenant_a and notification_type = 'workflow_notification';
  select count(*) into v_notices_b from public.notifications where tenant_id = v_tenant_b and notification_type = 'workflow_notification';
  select count(*) into v_audits from public.audit_logs where tenant_id = v_tenant_a and action = 'review_request.rating_followup_created' and entity_id = v_request::text;
  select count(*) into v_messages from public.messages where tenant_id = v_tenant_a;

  if v_tasks_a <> 1 then raise exception 'FAIL: expected 1 task in tenant A, got %', v_tasks_a; end if;
  if v_tasks_b <> 0 then raise exception 'FAIL: tenant B got a task'; end if;
  if v_notices_a < 1 then raise exception 'FAIL: expected an in-app notice in tenant A'; end if;
  if v_notices_b <> 0 then raise exception 'FAIL: tenant B got a notice'; end if;
  if v_audits <> 1 then raise exception 'FAIL: expected one rating audit row, got %', v_audits; end if;
  if v_messages <> 0 then raise exception 'FAIL: rating follow-up must not send a message'; end if;
  raise notice 'PASS: rating follow-up is tenant-scoped and sends no message';
end;
$$;

-- 2. Resubmitting updates feedback but does not duplicate the task.
do $$
declare
  v_tenant uuid;
  v_result jsonb;
  v_tasks integer;
  v_feedback text;
begin
  perform test.act_as(null, null, 'service_role');
  select id into v_tenant from public.businesses where slug = 'rating-clinic-a';
  perform test.act_as(null, null, 'anon');
  v_result := public.public_review_submit_feedback('rating-token-a', 2, 'Changed my mind.');

  if coalesce((v_result ->> 'follow_up_task_created')::boolean, true) is not false then
    raise exception 'FAIL: resubmission must not create another task';
  end if;

  perform test.act_as(null, null, 'service_role');
  select count(*) into v_tasks from public.tasks where tenant_id = v_tenant;
  select customer_feedback into v_feedback from public.review_requests where public_token = 'rating-token-a';

  if v_tasks <> 1 then raise exception 'FAIL: expected still one task, got %', v_tasks; end if;
  if coalesce(v_feedback, '') <> 'Changed my mind.' then raise exception 'FAIL: feedback was not updated'; end if;
  raise notice 'PASS: resubmission is idempotent for follow-up tasks';
end;
$$;

-- 3. Rating outside 1-5 is rejected.
do $$
begin
  perform test.act_as(null, null, 'anon');
  perform test.expect_error($sql$select public.public_review_submit_feedback('rating-token-b', 0, null)$sql$);
end;
$$;

rollback;
