-- ============================================================================
-- milestone2_crm.sql
-- Milestone 2 CRM workflow, permission and cross-tenant security checks.
--
-- Run against a local Supabase database:
--   psql "$DATABASE_URL" -f supabase/tests/milestone2_crm.sql
--
-- In the hosted Supabase SQL Editor, remove the psql-only \set line first.
-- The whole file is one transaction and is always rolled back.
-- ============================================================================
\set ON_ERROR_STOP on

begin;

create schema if not exists test;

create table test.m2_results (
  id bigint generated always as identity primary key,
  test_name text not null,
  passed boolean not null,
  detail text not null default ''
);

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
end;
$$;

create or replace function test.m2_assert(p_name text, p_ok boolean, p_detail text default '')
returns void
language plpgsql
as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FAIL: % (%)', p_name, p_detail;
  end if;
  insert into test.m2_results (test_name, passed, detail) values (p_name, true, p_detail);
end;
$$;

grant usage on schema test to authenticated;
grant select, insert on test.m2_results to authenticated;
grant execute on all functions in schema test to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm2-owner-a@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"M2 Owner A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'm2-owner-b@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"M2 Owner B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a3000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'm2-manager-a@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"M2 Manager A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a4000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'm2-employee-a@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"M2 Employee A"}', now(), now());

select test.act_as('a1000000-0000-4000-8000-000000000001', 'm2-owner-a@example.test');
select public.create_business('M2 Alpha Clinic', 'm2-alpha-clinic', 'dental-clinic');
select public.apply_industry_template((select id from public.businesses where slug = 'm2-alpha-clinic'), 'dental-clinic');

select test.act_as('a2000000-0000-4000-8000-000000000002', 'm2-owner-b@example.test');
select public.create_business('M2 Beta Salon', 'm2-beta-salon', 'salon-spa');

-- Roles in tenant A via the validated invitation RPC. Tokens are captured at
-- creation time because managers/employees cannot read invitation rows (RLS).
do $$
declare
  v_a uuid;
  v_token text;
begin
  perform test.act_as('a1000000-0000-4000-8000-000000000001', 'm2-owner-a@example.test');
  v_a := (select id from public.businesses where slug = 'm2-alpha-clinic');
  v_token := public.create_business_invitation(v_a, 'm2-manager-a@example.test', 'manager');
  perform set_config('test.m2_manager_token', v_token, true);
  v_token := public.create_business_invitation(v_a, 'm2-employee-a@example.test', 'employee');
  perform set_config('test.m2_employee_token', v_token, true);
end;
$$;

select test.act_as('a3000000-0000-4000-8000-000000000003', 'm2-manager-a@example.test');
select public.accept_business_invitation(current_setting('test.m2_manager_token'));
select test.act_as('a4000000-0000-4000-8000-000000000004', 'm2-employee-a@example.test');
select public.accept_business_invitation(current_setting('test.m2_employee_token'));

-- ---------------------------------------------------------------------------
-- 1. Contact creation, editing and dedup
-- ---------------------------------------------------------------------------
do $$
declare
  v_a uuid := (select id from public.businesses where slug = 'm2-alpha-clinic');
  v_contact uuid;
  v_source uuid := (select id from public.lead_sources where tenant_id = v_a and name = 'Website');
  v_lead_status text;
  v_activities integer;
begin
  perform test.act_as('a1000000-0000-4000-8000-000000000001', 'm2-owner-a@example.test');
  v_contact := public.create_contact(v_a, 'Asha', 'Sharma', 'asha.m2@example.test', '9876543210', 'Smile Dental', null, v_source, 'Initial enquiry');
  perform test.m2_assert('contact created with lead status',
    exists (select 1 from public.contacts where id = v_contact and tenant_id = v_a and status = 'lead' and lead_status = 'new'));
  perform test.m2_assert('lead source resolved via tenant catalogue',
    exists (select 1 from public.contacts where id = v_contact and source = 'Website' and source_id = v_source));

  perform test.expect_error(format(
    'select public.create_contact(%L, ''Duplicate'', null, ''asha.m2@example.test'', null, null, null, null, null)', v_a));
  perform test.expect_error(format(
    'select public.create_contact(%L, ''Duplicate Phone'', null, null, ''9876543210'', null, null, null, null)', v_a));
  perform test.m2_assert('duplicate email and phone rejected', true);

  perform public.update_contact(v_a, v_contact, 'Asha', 'Sharma', 'asha.m2@example.test', '9876543210', 'Smile Dental', 'Follow-up done', 'qualified', now());
  select lead_status into v_lead_status from public.contacts where id = v_contact;
  perform test.m2_assert('contact edit updates lead status', v_lead_status = 'qualified', v_lead_status);

  select count(*) into v_activities from public.contact_activities
  where tenant_id = v_a and contact_id = v_contact and type = 'status_change';
  perform test.m2_assert('status change written to activity timeline', v_activities >= 1, v_activities::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Lead assignment, employee visibility and claiming
-- ---------------------------------------------------------------------------
do $$
declare
  v_a uuid := (select id from public.businesses where slug = 'm2-alpha-clinic');
  v_contact uuid := (select id from public.contacts where tenant_id = v_a and email = 'asha.m2@example.test');
  v_unassigned uuid;
  v_manager uuid := 'a3000000-0000-4000-8000-000000000003';
  v_employee uuid := 'a4000000-0000-4000-8000-000000000004';
  v_cnt integer;
  v_assigned uuid;
begin
  perform test.act_as('a1000000-0000-4000-8000-000000000001', 'm2-owner-a@example.test');
  perform public.assign_contact(v_a, v_contact, v_manager);
  select assigned_to into v_assigned from public.contacts where id = v_contact;
  perform test.m2_assert('owner can assign lead to manager', v_assigned = v_manager);

  v_unassigned := public.create_contact(v_a, 'Unassigned', 'Lead', 'unassigned.m2@example.test', '9000000001');
  perform test.act_as('a4000000-0000-4000-8000-000000000004', 'm2-employee-a@example.test');
  select count(*) into v_cnt from public.contacts where id = v_unassigned;
  perform test.m2_assert('employee sees unassigned leads', v_cnt = 1, v_cnt::text);
  select count(*) into v_cnt from public.contacts where id = v_contact;
  perform test.m2_assert('employee cannot see another user''s assigned lead', v_cnt = 0, v_cnt::text);

  perform public.claim_lead(v_a, v_unassigned);
  select assigned_to into v_assigned from public.contacts where id = v_unassigned;
  perform test.m2_assert('employee can claim unassigned lead', v_assigned = v_employee);

  perform test.expect_error(format('select public.assign_contact(%L, %L, %L)', v_a, v_unassigned, v_manager));
  perform test.m2_assert('employee cannot reassign a claimed lead', true);

  perform test.act_as('a1000000-0000-4000-8000-000000000001', 'm2-owner-a@example.test');
  perform test.expect_error(format('select public.assign_contact(%L, %L, %L)', v_a, v_unassigned,
    'a2000000-0000-4000-8000-000000000002'::uuid));
  perform test.m2_assert('cross-tenant assignment rejected', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Deals, stage changes and stage/pipeline integrity
-- ---------------------------------------------------------------------------
do $$
declare
  v_a uuid := (select id from public.businesses where slug = 'm2-alpha-clinic');
  v_contact uuid := (select id from public.contacts where tenant_id = v_a and email = 'asha.m2@example.test');
  v_pipeline uuid := (select id from public.pipelines where tenant_id = v_a and is_default limit 1);
  v_stage uuid := (select id from public.pipeline_stages where tenant_id = v_a and pipeline_id = v_pipeline order by position limit 1);
  v_won_stage uuid;
  v_pipeline2 uuid;
  v_stage2 uuid;
  v_deal uuid;
  v_status text;
  v_cnt integer;
begin
  perform test.act_as('a1000000-0000-4000-8000-000000000001', 'm2-owner-a@example.test');
  v_won_stage := public.create_pipeline_stage(v_a, v_pipeline, 'M2 Closed Won', 100, true, true);
  v_pipeline2 := public.create_pipeline(v_a, 'M2 Secondary Pipeline');
  v_stage2 := public.create_pipeline_stage(v_a, v_pipeline2, 'M2 Intro', 10);

  perform test.act_as('a3000000-0000-4000-8000-000000000003', 'm2-manager-a@example.test');
  v_deal := public.create_deal(v_a, v_contact, v_pipeline, v_stage, 'Smile makeover', 50000, 'INR', null, current_date + 30);
  perform test.m2_assert('manager can create deal',
    exists (select 1 from public.deals where id = v_deal and tenant_id = v_a and status = 'open' and value = 50000));

  perform public.move_deal_stage(v_a, v_deal, v_won_stage);
  select status into v_status from public.deals where id = v_deal;
  perform test.m2_assert('moving to won stage sets status', v_status = 'won', v_status);
  select count(*) into v_cnt from public.contact_activities
  where tenant_id = v_a and deal_id = v_deal and type = 'stage_change';
  perform test.m2_assert('stage change written to activity timeline', v_cnt = 1, v_cnt::text);

  perform test.expect_error(format('select public.move_deal_stage(%L, %L, %L)', v_a, v_deal, v_stage2));
  perform test.expect_error(format(
    'insert into public.deals (tenant_id, contact_id, pipeline_id, stage_id, title) values (%L,%L,%L,%L,''Mismatch'')',
    v_a, v_contact, v_pipeline, v_stage2));
  perform test.m2_assert('stage from another pipeline rejected', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Activities, activity visibility and search / pagination
-- ---------------------------------------------------------------------------
do $$
declare
  v_a uuid := (select id from public.businesses where slug = 'm2-alpha-clinic');
  v_contact uuid := (select id from public.contacts where tenant_id = v_a and email = 'asha.m2@example.test');
  v_employee uuid := 'a4000000-0000-4000-8000-000000000004';
  v_activity uuid;
  v_rows integer;
  v_total bigint;
  v_metrics jsonb;
begin
  perform test.act_as('a3000000-0000-4000-8000-000000000003', 'm2-manager-a@example.test');
  v_activity := public.add_contact_activity(v_a, v_contact, 'call', 'Follow-up call', 'Patient agreed to visit', null, now());
  perform test.m2_assert('activity created with authenticated creator',
    exists (select 1 from public.contact_activities
            where id = v_activity and created_by = 'a3000000-0000-4000-8000-000000000003'::uuid));

  perform test.act_as('a1000000-0000-4000-8000-000000000001', 'm2-owner-a@example.test');
  perform public.create_contact(v_a, 'Search', 'One', 'search1.m2@example.test', '9100000001');
  perform public.create_contact(v_a, 'Search', 'Two', 'search2.m2@example.test', '9100000002');
  perform public.create_contact(v_a, 'Search', 'Three', 'search3.m2@example.test', '9100000003');

  select count(*), coalesce(max(total_count), 0) into v_rows, v_total
  from public.crm_search_contacts(v_a, 'Search', null, null, null, null, null, 2, 0);
  perform test.m2_assert('search respects page size', v_rows = 2, v_rows::text);
  perform test.m2_assert('search reports total count', v_total >= 3, v_total::text);

  select count(*) into v_rows
  from public.crm_search_contacts(v_a, 'Search', null, null, null, null, null, 2, 2);
  perform test.m2_assert('pagination offset works', v_rows >= 1, v_rows::text);

  select count(*) into v_rows
  from public.crm_search_contacts(v_a, null, 'lead', null, null, null, null, 100, 0);
  perform test.m2_assert('status filter works', v_rows >= 1, v_rows::text);

  v_metrics := public.crm_dashboard_metrics(v_a);
  perform test.m2_assert('dashboard contact count is real',
    (v_metrics->>'total_contacts')::integer >= 5, v_metrics->>'total_contacts');
  perform test.m2_assert('dashboard won deals counted',
    (v_metrics->>'won_deals')::integer >= 1, v_metrics->>'won_deals');
  perform test.m2_assert('dashboard breakdowns are arrays',
    jsonb_typeof(v_metrics->'leads_by_source') = 'array'
    and jsonb_typeof(v_metrics->'deals_by_stage') = 'array'
    and jsonb_array_length(v_metrics->'recent_activities') >= 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Cross-tenant isolation: reads, writes and RPCs
-- ---------------------------------------------------------------------------
do $$
declare
  v_a uuid := (select id from public.businesses where slug = 'm2-alpha-clinic');
  v_b uuid := (select id from public.businesses where slug = 'm2-beta-salon');
  v_contact uuid := (select id from public.contacts where tenant_id = v_a and email = 'asha.m2@example.test');
  v_deal uuid := (select id from public.deals where tenant_id = v_a and title = 'Smile makeover');
  v_first text;
  v_title text;
  v_cnt integer;
  v_metrics jsonb;
begin
  perform test.act_as('a2000000-0000-4000-8000-000000000002', 'm2-owner-b@example.test');

  select count(*) into v_cnt from public.contacts where tenant_id = v_a;
  perform test.m2_assert('business B cannot read A contacts', v_cnt = 0, v_cnt::text);
  select count(*) into v_cnt from public.deals where tenant_id = v_a;
  perform test.m2_assert('business B cannot read A deals', v_cnt = 0, v_cnt::text);
  select count(*) into v_cnt from public.contact_activities where tenant_id = v_a;
  perform test.m2_assert('business B cannot read A activities', v_cnt = 0, v_cnt::text);

  perform test.expect_error(format('insert into public.contacts (tenant_id, first_name) values (%L, ''Intruder'')', v_a));
  perform test.expect_error(format('insert into public.contact_activities (tenant_id, contact_id, type, created_by) values (%L, %L, ''note'', %L)',
    v_a, v_contact, 'a2000000-0000-4000-8000-000000000002'::uuid));
  perform test.m2_assert('cross-tenant inserts denied', true);

  update public.contacts set first_name = 'Hacked' where tenant_id = v_a and id = v_contact;
  update public.deals set title = 'Hacked' where tenant_id = v_a and id = v_deal;
  delete from public.contacts where tenant_id = v_a and id = v_contact;
  perform test.m2_assert('cross-tenant update/delete matched no rows', true);

  v_metrics := public.crm_dashboard_metrics(v_a);
  perform test.m2_assert('cross-tenant dashboard RPC returns no data', v_metrics = '{}'::jsonb, v_metrics::text);
  select count(*) into v_cnt from public.crm_search_contacts(v_a, null, null, null, null, null, null, 100, 0);
  perform test.m2_assert('cross-tenant search returns no rows', v_cnt = 0, v_cnt::text);
  perform test.expect_error(format('select public.move_deal_stage(%L, %L, %L)', v_a, v_deal,
    (select id from public.pipeline_stages where tenant_id = v_a limit 1)));
  perform test.m2_assert('cross-tenant stage move RPC denied', true);

  perform test.act_as('a1000000-0000-4000-8000-000000000001', 'm2-owner-a@example.test');
  select first_name into v_first from public.contacts where id = v_contact;
  select title into v_title from public.deals where id = v_deal;
  perform test.m2_assert('A contact unchanged by B', v_first = 'Asha', coalesce(v_first, 'NULL'));
  perform test.m2_assert('A deal unchanged and not deleted by B', v_title = 'Smile makeover', coalesce(v_title, 'NULL'));
  perform test.expect_error(format('insert into public.business_invitations (tenant_id, email, role) values (%L, ''hack.m2@example.test'', ''manager'')', v_a));
  perform test.m2_assert('direct invitation INSERT blocked (RPC only)', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Invalid tenant references and configuration hardening
-- ---------------------------------------------------------------------------
do $$
declare
  v_a uuid;
  v_b uuid;
  v_contact uuid;
  v_tag_a uuid;
  v_tag_b uuid;
  v_source_b uuid;
  v_stage_b uuid;
  v_pipeline_b uuid;
  v_currency text;
begin
  perform test.act_as('a1000000-0000-4000-8000-000000000001', 'm2-owner-a@example.test');
  v_a := (select id from public.businesses where slug = 'm2-alpha-clinic');
  v_contact := (select id from public.contacts where tenant_id = v_a and email = 'asha.m2@example.test');
  insert into public.tags (tenant_id, name, color) values (v_a, 'M2 VIP', 'red') returning id into v_tag_a;

  perform test.act_as('a2000000-0000-4000-8000-000000000002', 'm2-owner-b@example.test');
  v_b := (select id from public.businesses where slug = 'm2-beta-salon');
  insert into public.tags (tenant_id, name) values (v_b, 'M2 Beta Tag') returning id into v_tag_b;
  insert into public.lead_sources (tenant_id, name, type) values (v_b, 'M2 Beta Source', 'website') returning id into v_source_b;
  v_pipeline_b := public.create_pipeline(v_b, 'M2 Beta Pipeline');
  v_stage_b := public.create_pipeline_stage(v_b, v_pipeline_b, 'M2 Beta Stage');

  perform test.act_as('a1000000-0000-4000-8000-000000000001', 'm2-owner-a@example.test');
  perform test.expect_error(format('insert into public.contact_tags (tenant_id, contact_id, tag_id) values (%L, %L, %L)', v_a, v_contact, v_tag_b));
  perform test.expect_error(format('select public.create_contact(%L, ''Bad Source'', null, ''bad-source.m2@example.test'', null, null, null, %L, null)', v_a, v_source_b));
  perform test.expect_error(format('select public.move_deal_stage(%L, (select id from public.deals where tenant_id = %L limit 1), %L)', v_a, v_a, v_stage_b));
  perform test.m2_assert('cross-tenant tag/source/stage references rejected', true);

  -- Narrowed invitation GUC: an owner cannot promote to owner even with the flag set.
  perform set_config('app.invitation_accept', v_a::text, true);
  perform test.expect_error(format('update public.business_members set role = ''owner'' where tenant_id = %L and user_id = ''a4000000-0000-4000-8000-000000000004''::uuid', v_a));
  perform set_config('app.invitation_accept', '', true);
  perform test.m2_assert('invitation GUC bypass is narrowly scoped', true);

  perform test.act_as('a4000000-0000-4000-8000-000000000004', 'm2-employee-a@example.test');
  update public.business_settings set currency = 'USD' where tenant_id = v_a;
  perform test.act_as('a1000000-0000-4000-8000-000000000001', 'm2-owner-a@example.test');
  select currency into v_currency from public.business_settings where tenant_id = v_a;
  perform test.m2_assert('employee cannot change business configuration', v_currency = 'INR', coalesce(v_currency, 'NULL'));
end;
$$;

-- Final result: a passing run reports 37/37 with zero failures. Any failed
-- assertion aborts the script with a FAIL exception before this point.
select
  count(*) as total_checks,
  count(*) filter (where passed) as passed_checks,
  count(*) filter (where not passed) as failed_checks
from test.m2_results;

rollback;
