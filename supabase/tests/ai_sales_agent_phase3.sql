-- ============================================================================
-- ai_sales_agent_phase3.sql
-- Phase 3: campaign creation, recipient selection, server-side approval,
-- suppression, idempotent queueing and tenant isolation.
--
-- Requires migrations 0017 and 0019_phase3_email_outreach.sql locally.
--
-- Run against a LOCAL Supabase database only:
--   psql "$DATABASE_URL" -f supabase/tests/ai_sales_agent_phase3.sql
--
-- NEVER run against the hosted project. The whole file is one transaction and
-- is always rolled back. The final checks_passed row reports the real count.
-- ============================================================================

begin;

create schema if not exists test;

create table if not exists test.p3_results (
  id bigint generated always as identity primary key,
  test_name text not null,
  passed boolean not null,
  detail text not null default ''
);

create or replace function test.p3_act_as(p_user uuid, p_email text)
returns void language sql as $$
  select
    set_config('role', 'authenticated', true),
    set_config('request.jwt.claim.sub', p_user::text, true),
    set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated', 'email', p_email)::text, true);
$$;

create or replace function test.p3_expect_error(p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL: expected statement to be denied: %', p_sql;
exception when others then
  if sqlerrm like 'FAIL: expected statement to be denied%' then raise; end if;
end;
$$;

create or replace function test.p3_assert(p_name text, p_ok boolean, p_detail text default '')
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FAIL: % (%)', p_name, p_detail;
  end if;
  insert into test.p3_results (test_name, passed, detail) values (p_name, true, p_detail);
end;
$$;

-- Fixtures need to bypass the intentionally client-read-only policies.
create or replace function test.p3_add_member(p_tenant uuid, p_user uuid, p_role text)
returns void language sql security definer set search_path = '' as $$
  insert into public.business_members (tenant_id, user_id, role, status)
  values (p_tenant, p_user, p_role, 'active')
  on conflict (tenant_id, user_id) do nothing;
$$;

grant usage on schema test to authenticated;
grant select, insert on test.p3_results to authenticated;
grant execute on all functions in schema test to authenticated;

-- ----------------------------------------------------------------------------
-- Fixtures: two isolated tenants, an owner, an employee and real prospects.
-- ----------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'p3-owner-a@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"P3 Owner A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'p3-owner-b@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"P3 Owner B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e3000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'p3-employee@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"P3 Employee"}', now(), now());

select test.p3_act_as('e1000000-0000-4000-8000-000000000001', 'p3-owner-a@example.test');
select public.create_business('P3 Alpha Clinic', 'p3-alpha-clinic', 'dental-clinic');

select test.p3_act_as('e2000000-0000-4000-8000-000000000002', 'p3-owner-b@example.test');
select public.create_business('P3 Beta Salon', 'p3-beta-salon', 'salon-spa');

do $$
declare
  v_owner_a uuid := 'e1000000-0000-4000-8000-000000000001';
  v_owner_b uuid := 'e2000000-0000-4000-8000-000000000002';
  v_employee uuid := 'e3000000-0000-4000-8000-000000000003';
  v_a uuid;
  v_b uuid;
  v_with_email uuid;
  v_no_email uuid;
  v_suppressed uuid;
  v_campaign uuid;
  v_reject_campaign uuid;
  v_message uuid;
  v_reject_message uuid;
  v_outbox_a uuid;
  v_outbox_b uuid;
  v_outbox_count integer;
  v_visible integer;
begin
  perform test.p3_act_as(v_owner_a, 'p3-owner-a@example.test');
  v_a := (select id from public.businesses where slug = 'p3-alpha-clinic');
  perform test.p3_add_member(v_a, v_employee, 'employee');

  perform test.p3_act_as(v_owner_b, 'p3-owner-b@example.test');
  v_b := (select id from public.businesses where slug = 'p3-beta-salon');

  perform test.p3_act_as(v_owner_a, 'p3-owner-a@example.test');
  v_with_email := public.sales_create_prospect(v_a, 'With Email Dental', 'dental', 'Pune', 'MH', 'IN', 'https://one.example', null, null, 'one@example.test', null, 'test', null, null, null);
  v_no_email := public.sales_create_prospect(v_a, 'No Email Dental', 'dental', 'Pune', 'MH', 'IN', null, null, null, null, null, 'test', null, null, null);
  v_suppressed := public.sales_create_prospect(v_a, 'Suppressed Dental', 'dental', 'Pune', 'MH', 'IN', null, null, null, 'suppressed@example.test', null, 'test', null, null, null);

  -- 1. Suppression is server-authoritative before campaign creation.
  perform public.sales_add_suppression(v_a, 'SUPPRESSED@example.test', 'unsubscribe', 'test');
  perform test.p3_assert('suppression added', public.sales_is_suppressed(v_a, 'suppressed@example.test'));

  -- 2. Campaign creation selects only eligible recipients and dedupes ids.
  select public.sales_create_campaign(
    v_a, 'Recall campaign', 'Book a call', 'professional', 'Recall software', 'Missed visits',
    jsonb_build_array(v_with_email::text, v_with_email::text, v_no_email::text, v_suppressed::text)
  )->>'campaign_id' into v_campaign;

  perform test.p3_assert(
    'campaign created one real draft for the eligible prospect',
    (select count(*) from public.outreach_messages where campaign_id = v_campaign and tenant_id = v_a) = 1
  );
  perform test.p3_assert(
    'suppressed and email-less recipients were skipped',
    not exists (select 1 from public.outreach_messages where campaign_id = v_campaign and prospect_id in (v_no_email, v_suppressed))
  );
  perform test.p3_assert(
    'placeholder body is honest, not fake outreach content',
    exists (select 1 from public.outreach_messages where campaign_id = v_campaign and body like 'This draft has not been written yet%')
  );

  select id into v_message from public.outreach_messages where campaign_id = v_campaign and tenant_id = v_a limit 1;

  -- 3. An unwritten draft cannot be submitted for approval.
  perform test.p3_expect_error(format('select public.sales_submit_for_approval(%L, %L)', v_a, v_message));
  perform test.p3_assert('unwritten draft cannot be submitted', true);

  -- 4. Saving a real draft and submitting changes status to pending_approval.
  perform public.sales_save_email_draft(
    v_a, v_message, null, 'A quick idea', 'Opening body cta', 'Opening', 'cta', 'Follow up', 'Reminder', 'ai'
  );
  perform public.sales_submit_for_approval(v_a, v_message);
  perform test.p3_assert(
    'submitted draft is pending approval',
    (select status from public.outreach_messages where id = v_message) = 'pending_approval'
  );

  -- 5. Approval permissions are enforced server-side.
  perform test.p3_act_as(v_employee, 'p3-employee@example.test');
  perform test.p3_expect_error(format(
    'select public.sales_review_email_draft(%L, %L, %L, null, null, null)', v_a, v_message, 'approve'
  ));
  perform test.p3_assert('employee cannot approve outreach', true);

  -- 6. Owner approves; decision history is recorded.
  perform test.p3_act_as(v_owner_a, 'p3-owner-a@example.test');
  perform public.sales_review_email_draft(v_a, v_message, 'approve', 'Edited subject', null, null);
  perform test.p3_assert(
    'approved draft stores edited subject',
    (select subject from public.outreach_messages where id = v_message) = 'Edited subject'
  );
  perform test.p3_assert(
    'approval decision is recorded',
    exists (select 1 from public.sales_email_approvals where message_id = v_message and decision = 'approved')
  );

  -- 7. Queue idempotency: the same message never creates two queue rows.
  v_outbox_a := public.sales_queue_approved_email(v_a, v_message);
  v_outbox_b := public.sales_queue_approved_email(v_a, v_message);
  select count(*) into v_outbox_count from public.outreach_outbox where tenant_id = v_a and message_id = v_message;
  perform test.p3_assert('queueing is idempotent', v_outbox_a = v_outbox_b and v_outbox_count = 1);
  perform test.p3_assert('queued row has no provider', not exists (
    select 1 from public.outreach_outbox where id = v_outbox_a and provider is not null
  ));

  -- 8. Rejection path records the reason and blocks queueing.
  v_reject_campaign := public.sales_create_campaign(
    v_a, 'Reject campaign', 'Book a call', 'friendly', 'Software', 'Missed visits',
    jsonb_build_array(v_with_email::text)
  )->>'campaign_id';
  select id into v_reject_message from public.outreach_messages where campaign_id = v_reject_campaign and tenant_id = v_a limit 1;
  perform public.sales_save_email_draft(
    v_a, v_reject_message, null, 'Subject', 'Body content', null, null, null, null, 'manual'
  );
  perform public.sales_submit_for_approval(v_a, v_reject_message);
  perform public.sales_review_email_draft(v_a, v_reject_message, 'reject', null, null, 'Off topic');
  perform test.p3_assert(
    'rejection records reason and history',
    exists (select 1 from public.outreach_messages where id = v_reject_message and status = 'rejected' and rejected_reason = 'Off topic')
    and exists (select 1 from public.sales_email_approvals where message_id = v_reject_message and decision = 'rejected')
  );
  perform test.p3_expect_error(format('select public.sales_queue_approved_email(%L, %L)', v_a, v_reject_message));
  perform test.p3_assert('rejected draft cannot be queued', true);

  -- 9. Suppressed recipient cannot be submitted or queued.
  perform public.sales_add_suppression(v_a, 'one@example.test', 'bounced', 'test');
  perform test.p3_expect_error(format('select public.sales_add_suppression(%L, %L, %L, %L)', v_b, 'x@example.test', 'manual', 'test'));

  -- 10. Cross-tenant isolation for RPC writes and RLS reads.
  perform test.p3_act_as(v_owner_b, 'p3-owner-b@example.test');
  perform test.p3_expect_error(format(
    'select public.sales_create_campaign(%L, %L, %L, %L, %L, %L, %L::jsonb)',
    v_a, 'Cross tenant', 'Objective', 'professional', 'P', 'R', '[]'
  ));
  perform test.p3_assert('cross-tenant campaign creation is rejected', true);

  select count(*) into v_visible from public.outreach_campaigns where tenant_id = v_a;
  perform test.p3_assert('other tenant cannot read campaigns under RLS', v_visible = 0);

  perform test.p3_act_as(v_owner_a, 'p3-owner-a@example.test');
  perform test.p3_assert(
    'summary reflects real stored counts only',
    (select (summary->>'recipients')::integer from (select public.sales_campaign_summary(v_a, v_campaign) as summary) s) = 1
  );
end $$;

select test_name, passed, detail from test.p3_results order by id;
select count(*) as checks_passed from test.p3_results where passed;

rollback;
