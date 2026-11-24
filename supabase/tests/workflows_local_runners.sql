-- ============================================================================
-- workflows_local_runners.sql
-- Local-only security and behavior checks for migration 0040.
-- Requires a local database with all migrations through 0040 applied.
-- The whole file runs in one transaction and is always rolled back.
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
  ('00000000-0000-0000-0000-000000000000', '61111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'runner-owner@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Runner Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '62222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'runner-employee@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Runner Employee"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '63333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'runner-manager@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Runner Manager"}', now(), now());

select test.act_as('61111111-1111-4111-8111-111111111111', 'runner-owner@example.test');
select public.create_business('Runner Clinic', 'runner-clinic', 'dental-clinic');

select test.act_as('61111111-1111-4111-8111-111111111111', 'runner-owner@example.test');
select public.create_business_invitation(
  (select id from public.businesses where slug = 'runner-clinic'),
  'runner-employee@example.test', 'employee'
);

-- Invitations are accepted while acting as the invited employee.
do $$
declare v_token text;
begin
  select token into v_token from public.business_invitations
  where email = 'runner-employee@example.test' order by created_at desc limit 1;
  perform test.act_as('62222222-2222-4222-8222-222222222222', 'runner-employee@example.test');
  perform public.accept_business_invitation(v_token);
end;
$$;

-- A manager is the notify_team recipient; notify_team skips the acting owner.
select test.act_as('61111111-1111-4111-8111-111111111111', 'runner-owner@example.test');
select public.create_business_invitation(
  (select id from public.businesses where slug = 'runner-clinic'),
  'runner-manager@example.test', 'manager'
);

do $$
declare v_token text;
begin
  select token into v_token from public.business_invitations
  where email = 'runner-manager@example.test' order by created_at desc limit 1;
  perform test.act_as('63333333-3333-4333-8333-333333333333', 'runner-manager@example.test');
  perform public.accept_business_invitation(v_token);
end;
$$;

-- Definitions are inserted directly with the trusted role; the browser can
-- only create them through the audited workflows_create RPC.
select test.act_as(null, null, 'service_role');
insert into public.workflows (tenant_id, name, trigger_type, actions, status, created_by)
select b.id, 'Local lead runner', 'lead_created',
       jsonb_build_array(
         jsonb_build_object('type', 'create_task', 'label', 'Callback task', 'config', jsonb_build_object('value', 'Call lead')),
         jsonb_build_object('type', 'notify_team', 'label', 'Notify team', 'config', jsonb_build_object('value', 'New lead')),
         jsonb_build_object('type', 'webhook_placeholder', 'label', 'Provider step', 'config', '{}'::jsonb)
       ),
       'active', '61111111-1111-4111-8111-111111111111'::uuid
from public.businesses b where b.slug = 'runner-clinic';

insert into public.workflows (tenant_id, name, trigger_type, actions, status, created_by)
select b.id, 'Local booking runner', 'appointment_created',
       jsonb_build_array(jsonb_build_object('type', 'create_task', 'label', 'Reminder task', 'config', '{}'::jsonb)),
       'active', '61111111-1111-4111-8111-111111111111'::uuid
from public.businesses b where b.slug = 'runner-clinic';

insert into public.workflows (tenant_id, name, trigger_type, actions, status, created_by)
select b.id, 'Local manual runner', 'manual',
       jsonb_build_array(jsonb_build_object('type', 'notify_team', 'label', 'Manual notice', 'config', '{}'::jsonb)),
       'active', '61111111-1111-4111-8111-111111111111'::uuid
from public.businesses b where b.slug = 'runner-clinic';

-- 1. A new lead creates local tasks/notices and no external records.
do $$
declare
  v_tenant uuid := (select id from public.businesses where slug = 'runner-clinic');
  v_contact uuid;
  v_runs integer;
  v_tasks integer;
  v_notices integer;
  v_steps integer;
  v_skipped integer;
  v_reviews integer;
begin
  perform test.act_as('61111111-1111-4111-8111-111111111111', 'runner-owner@example.test');
  insert into public.contacts (tenant_id, first_name, last_name, status)
  values (v_tenant, 'Lead', 'Runner', 'lead') returning id into v_contact;

  select count(*) into v_runs from public.workflow_runs where tenant_id = v_tenant and source_id = v_contact;
  select count(*) into v_tasks from public.tasks where tenant_id = v_tenant and title = 'Callback task';

  -- notify_team excludes the acting owner, so count tenant-wide with service_role.
  perform test.act_as(null, null, 'service_role');
  select count(*) into v_notices from public.notifications where tenant_id = v_tenant and notification_type = 'workflow_notification';
  perform test.act_as('61111111-1111-4111-8111-111111111111', 'runner-owner@example.test');

  select count(*) into v_steps from public.workflow_run_steps s join public.workflow_runs r on r.id = s.run_id where r.tenant_id = v_tenant and r.source_id = v_contact;
  select count(*) into v_skipped from public.workflow_run_steps s join public.workflow_runs r on r.id = s.run_id where r.tenant_id = v_tenant and r.source_id = v_contact and s.status = 'skipped';
  perform test.act_as(null, null, 'service_role');
  select count(*) into v_reviews from public.review_requests where tenant_id = v_tenant and appointment_id = v_contact;

  if v_runs <> 1 then raise exception 'FAIL: expected 1 lead run, got %', v_runs; end if;
  if v_tasks <> 1 then raise exception 'FAIL: expected 1 local task, got %', v_tasks; end if;
  if v_notices < 1 then raise exception 'FAIL: expected at least one in-app notice'; end if;
  if v_steps <> 3 then raise exception 'FAIL: expected 3 steps, got %', v_steps; end if;
  if v_skipped <> 1 then raise exception 'FAIL: provider step must be skipped, got %', v_skipped; end if;
  if v_reviews <> 0 then raise exception 'FAIL: lead runner must not create review requests'; end if;
  raise notice 'PASS: lead runner local side effects and skipped provider step';
end;
$$;

-- 2. A new appointment creates a local run, not a review request.
do $$
declare
  v_tenant uuid := (select id from public.businesses where slug = 'runner-clinic');
  v_contact uuid := (select id from public.contacts where tenant_id = v_tenant order by created_at desc limit 1);
  v_appointment uuid;
  v_runs integer;
  v_reviews integer;
begin
  perform test.act_as('61111111-1111-4111-8111-111111111111', 'runner-owner@example.test');
  insert into public.appointments (tenant_id, contact_id, title, start_at, end_at, status)
  values (v_tenant, v_contact, 'Quote visit', now() + interval '1 day', now() + interval '2 days', 'scheduled')
  returning id into v_appointment;

  select count(*) into v_runs from public.workflow_runs where tenant_id = v_tenant and source_id = v_appointment;
  perform test.act_as(null, null, 'service_role');
  select count(*) into v_reviews from public.review_requests where tenant_id = v_tenant and appointment_id = v_appointment;
  if v_runs <> 1 then raise exception 'FAIL: expected 1 appointment run, got %', v_runs; end if;
  if v_reviews <> 0 then raise exception 'FAIL: appointment-created runner must not create review requests'; end if;
  raise notice 'PASS: appointment-created runner stays local';
end;
$$;

-- 3. Manual runs require manager+ and are idempotent by dedupe key.
do $$
declare
  v_tenant uuid := (select id from public.businesses where slug = 'runner-clinic');
  v_workflow uuid := (select id from public.workflows where tenant_id = v_tenant and trigger_type = 'manual');
  v_dedupe uuid := 'a44a5ad0-d8f2-4369-9642-a3ddf8cc02c2';
  v_first uuid;
  v_second uuid;
  v_runs integer;
begin
  perform test.act_as('62222222-2222-4222-8222-222222222222', 'runner-employee@example.test');
  perform test.expect_error(format('select public.workflows_run_manual(%L, %L, %L)', v_tenant, v_workflow, '{}'::jsonb));

  perform test.act_as('61111111-1111-4111-8111-111111111111', 'runner-owner@example.test');
  v_first := public.workflows_run_manual(v_tenant, v_workflow, jsonb_build_object('dedupe_key', v_dedupe));
  v_second := public.workflows_run_manual(v_tenant, v_workflow, jsonb_build_object('dedupe_key', v_dedupe));
  if v_first is null then raise exception 'FAIL: first manual run did not execute'; end if;
  if v_second is not null then raise exception 'FAIL: duplicate manual run was not skipped'; end if;
  select count(*) into v_runs from public.workflow_runs where tenant_id = v_tenant and source_id = v_dedupe;
  if v_runs <> 1 then raise exception 'FAIL: expected one deduped run, got %', v_runs; end if;
  raise notice 'PASS: manual runner role check and dedupe';
end;
$$;

rollback;
