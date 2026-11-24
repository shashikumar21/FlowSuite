-- ============================================================================
-- review_flow_upgrade.sql
-- Local-only security and behavior checks for migration 0049. Runs in one
-- rolled-back transaction. Requires a local database with all migrations
-- through 0049 applied. No external sends and no hosted writes.
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
  ('00000000-0000-0000-0000-000000000000', '81111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'review-flow-owner-a@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Review Flow Owner A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '82222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'review-flow-owner-b@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Review Flow Owner B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '83333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'review-flow-employee@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Review Flow Employee"}', now(), now());

select test.act_as('81111111-1111-4111-8111-111111111111', 'review-flow-owner-a@example.test');
select public.create_business('Review Flow Alpha', 'review-flow-alpha', 'dental-clinic');

select test.act_as('82222222-2222-4222-8222-222222222222', 'review-flow-owner-b@example.test');
select public.create_business('Review Flow Beta', 'review-flow-beta', 'salon-spa');

-- Add an employee to tenant A for role checks.
do $$
declare
  v_tenant_a uuid;
  v_invite text;
begin
  perform test.act_as(null, null, 'service_role');
  select id into v_tenant_a from public.businesses where slug = 'review-flow-alpha';
  perform test.act_as('81111111-1111-4111-8111-111111111111', 'review-flow-owner-a@example.test');
  v_invite := public.create_business_invitation(v_tenant_a, 'review-flow-employee@example.test', 'employee');
  perform test.act_as('83333333-3333-4333-8333-333333333333', 'review-flow-employee@example.test');
  perform public.accept_business_invitation(v_invite);
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Google review URL is tenant-scoped, validated, owner/admin only and audited
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant_a uuid;
  v_tenant_b uuid;
  v_stored text;
  v_audit_count integer;
  v_url_in_audit boolean;
begin
  perform test.act_as(null, null, 'service_role');
  select id into v_tenant_a from public.businesses where slug = 'review-flow-alpha';
  select id into v_tenant_b from public.businesses where slug = 'review-flow-beta';
  perform test.act_as('81111111-1111-4111-8111-111111111111', 'review-flow-owner-a@example.test');

  perform public.business_update_review_settings(v_tenant_a, 'https://g.page/r/review-flow-upgrade/review');
  select google_review_url into v_stored from public.businesses where id = v_tenant_a;
  if coalesce(v_stored, '') <> 'https://g.page/r/review-flow-upgrade/review' then
    raise exception 'FAIL: Google review URL was not saved for tenant A';
  end if;

  select count(*), bool_or(metadata ? 'google_review_url')
    into v_audit_count, v_url_in_audit
    from public.audit_logs
   where tenant_id = v_tenant_a and action = 'business.review_settings_updated';
  if v_audit_count <> 1 then raise exception 'FAIL: expected one review settings audit row'; end if;
  if coalesce(v_url_in_audit, false) then raise exception 'FAIL: full URL leaked into audit metadata'; end if;

  perform test.expect_error(format(
    'select public.business_update_review_settings(%L, %L)', v_tenant_a, 'https://evil.example.com/review'
  ));
  perform test.expect_error(format(
    'select public.business_update_review_settings(%L, %L)', v_tenant_a, 'http://g.page/r/review-flow-upgrade/review'
  ));
  perform test.expect_error(format(
    'select public.business_update_review_settings(%L, %L)', v_tenant_a, 'https://user:pass@g.page/r/abc'
  ));

  perform test.act_as('82222222-2222-4222-8222-222222222222', 'review-flow-owner-b@example.test');
  perform test.expect_error(format(
    'select public.business_update_review_settings(%L, %L)', v_tenant_a, 'https://g.page/r/other-tenant/review'
  ));

  perform test.act_as('83333333-3333-4333-8333-333333333333', 'review-flow-employee@example.test');
  perform test.expect_error(format(
    'select public.business_update_review_settings(%L, %L)', v_tenant_a, 'https://g.page/r/employee/review'
  ));

  raise notice 'PASS: review URL is tenant-scoped, validated, role-gated and metadata-only audited';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Owner reply context and draft RPCs are tenant-scoped and role-gated
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant_a uuid;
  v_tenant_b uuid;
  v_request_a uuid;
  v_request_b uuid;
  v_request_c uuid;
  v_context jsonb;
  v_list jsonb;
  v_draft text;
  v_status text;
  v_approver uuid;
  v_audits integer;
begin
  perform test.act_as(null, null, 'service_role');
  select id into v_tenant_a from public.businesses where slug = 'review-flow-alpha';
  select id into v_tenant_b from public.businesses where slug = 'review-flow-beta';
  perform test.act_as(null, null, 'service_role');
  insert into public.review_requests (tenant_id, customer_name, channel, review_link_type, review_url, status, rating, customer_feedback, public_token)
  values (v_tenant_a, 'Reply Test Customer', 'whatsapp', 'google', 'https://g.page/r/review-flow-upgrade/review', 'sent', 4, 'Great service and friendly team.', 'review-reply-token-a')
  returning id into v_request_a;

  insert into public.review_requests (tenant_id, customer_name, channel, status, rating, customer_feedback, public_token)
  values (v_tenant_b, 'Other Tenant Customer', 'whatsapp', 'sent', 5, 'Lovely place.', 'review-reply-token-b')
  returning id into v_request_b;

  insert into public.review_requests (tenant_id, customer_name, channel, review_link_type, review_url, status, public_token)
  values (v_tenant_a, 'Google Review Customer', 'whatsapp', 'google', 'https://g.page/r/review-flow-upgrade/review', 'sent', 'review-reply-token-c')
  returning id into v_request_c;

  perform test.act_as('81111111-1111-4111-8111-111111111111', 'review-flow-owner-a@example.test');
  v_context := public.review_reply_context(v_tenant_a, v_request_a);
  if coalesce(v_context ->> 'business_name', '') <> 'Review Flow Alpha' then raise exception 'FAIL: wrong business context'; end if;
  if coalesce(v_context ->> 'rating', '') <> '4' then raise exception 'FAIL: wrong rating context'; end if;

  perform test.expect_error('select * from public.review_requests limit 1');
  v_list := public.review_requests_list_for_ui(v_tenant_a);
  if jsonb_typeof(v_list) <> 'array' or jsonb_array_length(v_list) < 1 then raise exception 'FAIL: safe UI list returned no rows'; end if;
  if (v_list -> 0) ? 'owner_reply_draft' then raise exception 'FAIL: safe UI list exposed owner reply draft'; end if;

  perform test.expect_error(format('select public.review_reply_set_source(%L, %L, %L, %L)', v_tenant_a, v_request_c, 0, 'Bad rating'));
  perform public.review_reply_set_source(v_tenant_a, v_request_c, 5, 'Loved the cleaning and the friendly team.');
  v_context := public.review_reply_context(v_tenant_a, v_request_c);
  if coalesce(v_context ->> 'rating', '') <> '5' then raise exception 'FAIL: recorded rating was not used'; end if;
  if coalesce(v_context ->> 'customer_feedback', '') <> 'Loved the cleaning and the friendly team.' then raise exception 'FAIL: recorded review text was not used'; end if;
  if exists (
    select 1 from public.audit_logs
     where tenant_id = v_tenant_a and entity_id = v_request_c::text
       and action = 'review_reply.source_added' and metadata ? 'customer_feedback'
  ) then raise exception 'FAIL: review text leaked into audit metadata'; end if;

  perform test.expect_error(format('select public.review_reply_context(%L, %L)', v_tenant_b, v_request_a));
  perform test.expect_error(format('select public.review_reply_context(%L, %L)', v_tenant_a, v_request_b));

  perform test.act_as('83333333-3333-4333-8333-333333333333', 'review-flow-employee@example.test');
  perform test.expect_error(format('select public.review_reply_context(%L, %L)', v_tenant_a, v_request_a));
  perform test.expect_error(format('select public.review_reply_set_source(%L, %L, %L, %L)', v_tenant_a, v_request_c, 5, 'Employee attempt'));
  perform test.expect_error(format('select public.review_reply_set_status(%L, %L, %L)', v_tenant_a, v_request_a, 'approved'));
  perform test.expect_error(format(
    'select public.review_reply_save_draft(%L, %L, %L, %L)', v_tenant_a, v_request_a, 'Fake owner draft text.', 'generated'
  ));

  perform test.act_as(null, null, 'service_role');
  perform public.review_reply_save_draft(v_tenant_a, v_request_a, 'Thank you for the kind feedback. We are glad you enjoyed your visit.', 'generated');
  select owner_reply_draft, owner_reply_status into v_draft, v_status from public.review_requests where id = v_request_a;
  if v_draft is null or v_status <> 'generated' then raise exception 'FAIL: service draft was not saved'; end if;

  perform test.act_as('81111111-1111-4111-8111-111111111111', 'review-flow-owner-a@example.test');
  perform test.expect_error(format('select public.review_reply_set_status(%L, %L, %L)', v_tenant_a, v_request_a, 'copied'));
  perform public.review_reply_set_status(v_tenant_a, v_request_a, 'approved');
  perform test.act_as(null, null, 'service_role');
  select owner_reply_status, owner_reply_approved_by into v_status, v_approver from public.review_requests where id = v_request_a;
  if v_status <> 'approved' or v_approver is null then raise exception 'FAIL: owner approval was not recorded'; end if;

  -- Regenerating a draft clears stale approval metadata.
  perform public.review_reply_save_draft(v_tenant_a, v_request_a, 'Thanks for taking the time to share this feedback with us.', 'fallback');
  select owner_reply_status, owner_reply_approved_by into v_status, v_approver from public.review_requests where id = v_request_a;
  if v_status <> 'fallback' or v_approver is not null then raise exception 'FAIL: stale approval survived draft regeneration'; end if;

  perform test.act_as('81111111-1111-4111-8111-111111111111', 'review-flow-owner-a@example.test');
  perform test.expect_error(format('select public.review_reply_set_status(%L, %L, %L)', v_tenant_a, v_request_a, 'copied'));
  perform public.review_reply_set_status(v_tenant_a, v_request_a, 'approved');
  perform public.review_reply_set_status(v_tenant_a, v_request_a, 'copied');
  select count(*) into v_audits
    from public.audit_logs
   where tenant_id = v_tenant_a
     and entity_id = v_request_a::text
     and action in ('review_reply.generated', 'review_reply.approved', 'review_reply.copied')
     and metadata -> 'ai_assisted' = 'true'::jsonb;
  if v_audits <> 5 then raise exception 'FAIL: expected five AI-assisted reply audit rows, got %', v_audits; end if;

  raise notice 'PASS: owner reply RPCs require approval before copy and remain tenant-scoped, role-gated and audited';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Appointment-completed runner resolves Google URL and fails closed
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant_a uuid;
  v_tenant_b uuid;
  v_workflow_a uuid;
  v_workflow_b uuid;
  v_workflow_c uuid;
  v_appointment_a uuid;
  v_appointment_b uuid;
  v_appointment_c uuid;
  v_link_type text;
  v_link_url text;
  v_status text;
  v_audits integer;
begin
  perform test.act_as(null, null, 'service_role');
  select id into v_tenant_a from public.businesses where slug = 'review-flow-alpha';
  select id into v_tenant_b from public.businesses where slug = 'review-flow-beta';
  insert into public.workflows (tenant_id, name, trigger_type, actions, status)
  values (
    v_tenant_a, 'Review Flow Runner A', 'appointment_completed',
    jsonb_build_array(jsonb_build_object(
      'type', 'send_review_request',
      'label', 'Request review via your Google link',
      'config', jsonb_build_object('channel', 'whatsapp', 'delay_hours', '2', 'review_link_type', 'google', 'review_url', '')
    )),
    'active'
  )
  returning id into v_workflow_a;

  insert into public.appointments (tenant_id, title, start_at, end_at, status, customer_name, customer_phone)
  values (v_tenant_a, 'Review Flow Appointment A', now() + interval '1 day', now() + interval '1 day 30 minutes', 'scheduled', 'Runner Customer A', '+911111111111')
  returning id into v_appointment_a;

  update public.appointments set status = 'completed' where id = v_appointment_a;

  select review_link_type, review_url, status
    into v_link_type, v_link_url, v_status
    from public.review_requests
   where tenant_id = v_tenant_a and appointment_id = v_appointment_a and workflow_id = v_workflow_a;
  if v_link_type <> 'google' then raise exception 'FAIL: expected google link type, got %', coalesce(v_link_type, 'null'); end if;
  if coalesce(v_link_url, '') <> 'https://g.page/r/review-flow-upgrade/review' then raise exception 'FAIL: tenant Google URL was not used'; end if;
  if v_status <> 'pending_approval' then raise exception 'FAIL: runner must keep approval gate'; end if;

  insert into public.workflows (tenant_id, name, trigger_type, actions, status)
  values (
    v_tenant_b, 'Review Flow Runner B', 'appointment_completed',
    jsonb_build_array(jsonb_build_object(
      'type', 'send_review_request',
      'label', 'Request review via your Google link',
      'config', jsonb_build_object('channel', 'whatsapp', 'delay_hours', '2', 'review_link_type', 'google', 'review_url', '')
    )),
    'active'
  )
  returning id into v_workflow_b;

  insert into public.appointments (tenant_id, title, start_at, end_at, status, customer_name, customer_phone)
  values (v_tenant_b, 'Review Flow Appointment B', now() + interval '2 days', now() + interval '2 days 30 minutes', 'scheduled', 'Runner Customer B', '+922222222222')
  returning id into v_appointment_b;

  update public.appointments set status = 'completed' where id = v_appointment_b;

  select review_link_type, review_url, status
    into v_link_type, v_link_url, v_status
    from public.review_requests
   where tenant_id = v_tenant_b and appointment_id = v_appointment_b and workflow_id = v_workflow_b;
  if v_link_type <> 'flowsuite' then raise exception 'FAIL: expected FlowSuite fallback, got %', coalesce(v_link_type, 'null'); end if;
  if v_link_url is not null then raise exception 'FAIL: fallback must not carry a Google URL'; end if;
  if v_status <> 'pending_approval' then raise exception 'FAIL: fallback must keep approval gate'; end if;

  -- A tenant-configured custom URL keeps the pre-upgrade behaviour.
  insert into public.workflows (tenant_id, name, trigger_type, actions, status)
  values (
    v_tenant_b, 'Review Flow Runner C', 'appointment_completed',
    jsonb_build_array(jsonb_build_object(
      'type', 'send_review_request',
      'label', 'Request review via custom link',
      'config', jsonb_build_object('channel', 'whatsapp', 'delay_hours', '2', 'review_link_type', 'custom', 'review_url', 'https://reviews.example.com/custom')
    )),
    'active'
  )
  returning id into v_workflow_c;

  insert into public.appointments (tenant_id, title, start_at, end_at, status, customer_name, customer_phone)
  values (v_tenant_b, 'Review Flow Appointment C', now() + interval '3 days', now() + interval '3 days 30 minutes', 'scheduled', 'Runner Customer C', '+933333333333')
  returning id into v_appointment_c;

  update public.appointments set status = 'completed' where id = v_appointment_c;

  select review_link_type, review_url, status
    into v_link_type, v_link_url, v_status
    from public.review_requests
   where tenant_id = v_tenant_b and appointment_id = v_appointment_c and workflow_id = v_workflow_c;
  if v_link_type <> 'custom' then raise exception 'FAIL: expected custom link type, got %', coalesce(v_link_type, 'null'); end if;
  if coalesce(v_link_url, '') <> 'https://reviews.example.com/custom' then raise exception 'FAIL: tenant custom URL was not preserved'; end if;
  if v_status <> 'pending_approval' then raise exception 'FAIL: custom link must keep approval gate'; end if;

  select count(*) into v_audits
    from public.audit_logs
   where tenant_id = v_tenant_b
     and entity_id = v_appointment_b::text
     and action = 'review_request.google_link_missing';
  if v_audits <> 1 then raise exception 'FAIL: expected one missing-link audit row, got %', v_audits; end if;

  raise notice 'PASS: runner uses tenant Google URL and fails closed to FlowSuite';
end;
$$;

rollback;
