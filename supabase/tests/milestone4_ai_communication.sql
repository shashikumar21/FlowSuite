-- ============================================================================
-- milestone4_ai_communication.sql
-- Milestone 4 AI foundation checks: tenant isolation, owner/admin config
-- permissions, anon-safe public agent output, consent/opt-out, webhook
-- idempotency, service-role-only provider RPCs, contact/conversation/message
-- dedupe, follow-up dedupe and consent guards, usage limits, handoff, call
-- session foundation, and assessment safety (no invented lead scores).
--
-- Hosted Supabase SQL Editor: run with "Run without RLS".
-- Local psql: psql "$DATABASE_URL" -f supabase/tests/milestone4_ai_communication.sql
-- The whole file is one transaction and is always rolled back.
-- A passing run reports the number of checks in the final checks_passed row.
-- ============================================================================

begin;

create schema if not exists test;

create table test.m4_results (
  id bigint generated always as identity primary key,
  test_name text not null,
  passed boolean not null,
  detail text not null default ''
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

-- Provider workers authenticate with a service-role JWT claim. The database
-- role stays the SQL Editor caller so this suite can keep switching contexts.
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
  if sqlerrm like 'FAIL: expected statement to be denied%' then
    raise;
  end if;
end;
$$;

create or replace function test.m4_assert(p_name text, p_ok boolean, p_detail text default '')
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FAIL: % (%)', p_name, p_detail;
  end if;
  insert into test.m4_results (test_name, passed, detail) values (p_name, true, p_detail);
end;
$$;

grant usage on schema test to authenticated, anon, service_role;
grant select, insert on test.m4_results to authenticated, anon, service_role;
grant execute on all functions in schema test to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures: two tenants; Alpha has owner, admin, manager and employee.
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm4-owner-a@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"M4 Owner A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'm4-admin-a@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"M4 Admin A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c3000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'm4-manager-a@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"M4 Manager A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c4000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'm4-employee-a@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"M4 Employee A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c5000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'm4-owner-b@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"M4 Owner B"}', now(), now());

select test.act_as('c1000000-0000-4000-8000-000000000001', 'm4-owner-a@example.test');
select public.create_business('M4 Alpha Clinic', 'm4-alpha-clinic', 'dental-clinic');

select test.act_as('c5000000-0000-4000-8000-000000000005', 'm4-owner-b@example.test');
select public.create_business('M4 Beta Clinic', 'm4-beta-clinic', 'dental-clinic');

do $$
declare
  v_a uuid;
  v_token text;
begin
  perform test.act_as('c1000000-0000-4000-8000-000000000001', 'm4-owner-a@example.test');
  v_a := (select id from public.businesses where slug = 'm4-alpha-clinic');

  v_token := public.create_business_invitation(v_a, 'm4-admin-a@example.test', 'admin');
  perform test.act_as('c2000000-0000-4000-8000-000000000002', 'm4-admin-a@example.test');
  perform public.accept_business_invitation(v_token);

  perform test.act_as('c1000000-0000-4000-8000-000000000001', 'm4-owner-a@example.test');
  v_token := public.create_business_invitation(v_a, 'm4-manager-a@example.test', 'manager');
  perform test.act_as('c3000000-0000-4000-8000-000000000003', 'm4-manager-a@example.test');
  perform public.accept_business_invitation(v_token);

  perform test.act_as('c1000000-0000-4000-8000-000000000001', 'm4-owner-a@example.test');
  v_token := public.create_business_invitation(v_a, 'm4-employee-a@example.test', 'employee');
  perform test.act_as('c4000000-0000-4000-8000-000000000004', 'm4-employee-a@example.test');
  perform public.accept_business_invitation(v_token);
end;
$$;

do $$
declare
  v_a uuid;
  v_b uuid;
  v_owner_a constant uuid := 'c1000000-0000-4000-8000-000000000001';
  v_admin_a constant uuid := 'c2000000-0000-4000-8000-000000000002';
  v_manager_a constant uuid := 'c3000000-0000-4000-8000-000000000003';
  v_employee_a constant uuid := 'c4000000-0000-4000-8000-000000000004';
  v_owner_b constant uuid := 'c5000000-0000-4000-8000-000000000005';
  v_agent uuid;
  v_admin_agent uuid;
  v_agent_b uuid;
  v_public_key text;
  v_public jsonb;
  v_knowledge_a uuid;
  v_knowledge_hidden uuid;
  v_knowledge_b uuid;
  v_credential uuid;
  v_template uuid;
  v_sequence uuid;
  v_step1 uuid;
  v_step2 uuid;
  v_step3 uuid;
  v_key2 text;
  v_key3 text;
  v_contact uuid;
  v_contact_dup uuid;
  v_contact_b uuid;
  v_channel uuid;
  v_channel_b uuid;
  v_conv uuid;
  v_conv_dup uuid;
  v_msg uuid;
  v_msg_dup uuid;
  v_job uuid;
  v_job_dup uuid;
  v_job2 uuid;
  v_job3 uuid;
  v_event jsonb;
  v_event_dup jsonb;
  v_event_bad jsonb;
  v_session uuid;
  v_session2 uuid;
  v_handoff uuid;
  v_assessment uuid;
  v_latest jsonb;
  v_usage uuid;
  v_usage2 uuid;
  v_payload jsonb;
  v_score numeric;
  v_score_after numeric;
  v_count integer;
begin
  -- Capture tenant ids as their owners; RLS intentionally hides other tenants.
  perform test.act_as(v_owner_a, 'm4-owner-a@example.test');
  v_a := (select id from public.businesses where slug = 'm4-alpha-clinic');
  perform test.act_as(v_owner_b, 'm4-owner-b@example.test');
  v_b := (select id from public.businesses where slug = 'm4-beta-clinic');

  -- 1. Provider channel contact ingestion dedupes on normalized mobile.
  perform test.act_service();
  v_contact := public.ai_upsert_contact_from_channel(
    v_a, 'whatsapp', 'Asha Sharma', '+91 98765 43210', 'asha.m4@example.test'
  );
  v_contact_dup := public.ai_upsert_contact_from_channel(
    v_a, 'whatsapp', 'Asha Sharma Again', '+919876543210', 'other.m4@example.test'
  );
  perform test.m4_assert('same mobile returns the existing contact', v_contact_dup = v_contact, v_contact_dup::text);

  perform test.act_as(v_owner_a, 'm4-owner-a@example.test');
  select count(*) into v_count
  from public.contacts
  where id = v_contact and tenant_id = v_a and mobile = '+919876543210';
  perform test.m4_assert('channel contact created with normalized Indian mobile', v_count = 1, v_count::text);

  perform test.act_service();
  v_contact_b := public.ai_upsert_contact_from_channel(
    v_b, 'whatsapp', 'Beta Customer', '+91 90000 90001', 'beta.m4@example.test'
  );
  perform test.m4_assert('second tenant contact created', v_contact_b is not null);

  -- 2. Channels for conversation creation; only owner/admin can manage them.
  perform test.act_as(v_owner_a, 'm4-owner-a@example.test');
  insert into public.channels (tenant_id, name, channel_type, identifier, status, active)
  values (v_a, 'M4 WhatsApp', 'whatsapp', '+91 80000 00001', 'connected', true)
  returning id into v_channel;

  perform test.act_as(v_owner_b, 'm4-owner-b@example.test');
  insert into public.channels (tenant_id, name, channel_type, identifier, status, active)
  values (v_b, 'M4 Beta WhatsApp', 'whatsapp', '+91 80000 00002', 'connected', true)
  returning id into v_channel_b;

  -- 3. Agent configuration: owner/admin writes, member roles read only.
  perform test.act_as(v_owner_a, 'm4-owner-a@example.test');
  v_agent := public.ai_upsert_agent(
    v_a, 'M4 Front Desk', 'en', 'friendly', 'Dental cleaning and checkups.',
    '{"Mon":"09:00-18:00"}'::jsonb, '{"answer_faq":true}'::jsonb,
    false, null, 'short', 100, 'active'
  );
  perform test.m4_assert('owner can create an AI agent', v_agent is not null);
  select count(*) into v_count from public.ai_agent_tools where tenant_id = v_a and agent_id = v_agent;
  perform test.m4_assert('allowlisted tools are seeded for a new agent', v_count = 10, v_count::text);

  perform test.act_as(v_admin_a, 'm4-admin-a@example.test');
  v_admin_agent := public.ai_upsert_agent(
    v_a, 'M4 Admin Agent', 'en', 'professional', 'Admin-owned agent.',
    '{}'::jsonb, '{}'::jsonb, false, null, 'short', null, 'draft'
  );
  perform test.m4_assert('admin can create an AI agent', v_admin_agent is not null);

  perform test.act_as(v_manager_a, 'm4-manager-a@example.test');
  perform test.expect_error($q$select public.ai_upsert_agent(
    (select id from public.businesses where slug = 'm4-alpha-clinic'),
    'Manager Agent', 'en', 'friendly', null, '{}'::jsonb, '{}'::jsonb,
    false, null, 'short', null, 'draft'
  )$q$);
  perform test.m4_assert('manager cannot configure AI agents', true);

  perform test.expect_error(format(
    $q$select public.ai_set_tool(%L::uuid, %L::uuid, 'lookup_hours', true)$q$, v_a, v_agent
  ));
  perform test.m4_assert('manager cannot change AI tools', true);

  select count(*) into v_count from public.ai_agents where tenant_id = v_a;
  perform test.m4_assert('manager can read tenant agents', v_count = 2, v_count::text);

  perform test.act_as(v_employee_a, 'm4-employee-a@example.test');
  perform test.expect_error(format(
    $q$select public.ai_upsert_agent(%L::uuid, 'Employee Agent')$q$, v_a
  ));
  perform test.m4_assert('employee cannot configure AI agents', true);

  -- 4. Knowledge is tenant-isolated and only approved entries are public.
  perform test.act_as(v_owner_a, 'm4-owner-a@example.test');
  v_knowledge_a := public.ai_upsert_knowledge(
    v_a, v_agent, 'faq', 'Do you offer cleaning?', 'Yes, dental cleaning is available.', 'en', true
  );
  v_knowledge_hidden := public.ai_upsert_knowledge(
    v_a, v_agent, 'other', 'Internal pricing draft', 'Internal only draft content.', 'en', false
  );
  perform test.m4_assert('approved knowledge saved', v_knowledge_a is not null);
  perform test.m4_assert('unapproved knowledge saved privately', v_knowledge_hidden is not null);
  perform public.ai_set_tool(v_a, v_agent, 'lookup_hours', true, false, '{}'::jsonb);

  perform test.expect_error(format(
    $q$select public.ai_set_tool(%L::uuid, %L::uuid, 'drop_tables', true)$q$, v_a, v_agent
  ));
  perform test.m4_assert('unknown AI tool key is rejected', true);

  perform test.act_as(v_owner_b, 'm4-owner-b@example.test');
  v_agent_b := public.ai_upsert_agent(
    v_b, 'M4 Beta Agent', 'en', 'friendly', 'Beta-only business profile.',
    '{}'::jsonb, '{}'::jsonb, false, null, 'short', null, 'active'
  );
  v_knowledge_b := public.ai_upsert_knowledge(
    v_b, v_agent_b, 'faq', 'Beta secret', 'Only beta data should appear here.', 'en', true
  );

  perform test.act_as(v_owner_a, 'm4-owner-a@example.test');
  select count(*) into v_count
  from public.ai_agent_knowledge where tenant_id = v_b and id = v_knowledge_b;
  perform test.m4_assert('Alpha owner cannot read Beta knowledge', v_count = 0, v_count::text);
  perform test.expect_error(format(
    $q$select public.ai_upsert_knowledge(%L::uuid, %L::uuid, 'faq', 'Cross tenant', 'Should fail', 'en', true)$q$,
    v_a, v_agent_b
  ));
  perform test.m4_assert('cross-tenant knowledge write is rejected', true);

  -- 5. Credentials store secret references, never raw tokens or VITE names.
  v_credential := public.ai_upsert_credential(
    v_a, v_channel, 'whatsapp', 'META_WHATSAPP_TOKEN', '+91 80000 00001', '["messages"]'::jsonb
  );
  perform test.m4_assert('server-side credential reference saved', v_credential is not null);
  select count(*) into v_count
  from public.channel_credentials
  where id = v_credential and secret_ref = 'META_WHATSAPP_TOKEN';
  perform test.m4_assert('raw token is not stored in the credential row', v_count = 1, v_count::text);

  perform test.expect_error(format(
    $q$select public.ai_upsert_credential(%L::uuid, %L::uuid, 'whatsapp', 'VITE_META_TOKEN', null, '[]'::jsonb)$q$,
    v_a, v_channel
  ));
  perform test.m4_assert('VITE_ secret reference is rejected', true);

  perform test.act_as(v_manager_a, 'm4-manager-a@example.test');
  select count(*) into v_count from public.channel_credentials where tenant_id = v_a;
  perform test.m4_assert('manager cannot read provider credentials', v_count = 0, v_count::text);

  -- 6. Approved message template drives follow-up job payloads.
  perform test.act_as(v_owner_a, 'm4-owner-a@example.test');
  v_template := public.ai_upsert_template(
    v_a, 'm4_followup', 'Hello, following up on your dental enquiry.',
    'whatsapp', null, 'en', 'follow_up', 'approved'
  );
  perform test.m4_assert('approved WhatsApp template saved', v_template is not null);

  insert into public.ai_follow_up_sequences (tenant_id, name, channel, status)
  values (v_a, 'M4 Enquiry Follow-up', 'whatsapp', 'active')
  returning id into v_sequence;

  insert into public.ai_follow_up_steps (tenant_id, sequence_id, step_index, delay_minutes, template_key, condition, active)
  values (v_a, v_sequence, 1, 0, 'm4_followup', 'no_reply', true)
  returning id into v_step1;
  insert into public.ai_follow_up_steps (tenant_id, sequence_id, step_index, delay_minutes, template_key, condition, active)
  values (v_a, v_sequence, 2, 0, 'm4_followup', 'no_reply', true)
  returning id into v_step2;
  insert into public.ai_follow_up_steps (tenant_id, sequence_id, step_index, delay_minutes, template_key, condition, active)
  values (v_a, v_sequence, 3, 0, 'm4_followup', 'no_reply', true)
  returning id into v_step3;
  perform test.m4_assert('three-step follow-up sequence created', v_step1 is not null and v_step2 is not null and v_step3 is not null);

  -- 7. Public chatbot config: explicit key, approved knowledge only, no secrets.
  select public_key into v_public_key from public.ai_agents where id = v_agent;
  perform test.act_anon();
  v_public := public.ai_get_public_agent(v_public_key);
  perform test.m4_assert('anon can read public agent config', v_public->>'name' = 'M4 Front Desk', v_public::text);
  perform test.m4_assert('public config includes approved knowledge only',
    jsonb_array_length(v_public->'knowledge') = 1
    and v_public::text not like '%Internal only draft content%',
    (v_public->'knowledge')::text
  );
  perform test.m4_assert('public config excludes Beta knowledge', v_public::text not like '%Only beta data%');
  perform test.m4_assert('public config includes only enabled tools',
    v_public->'tools' ? 'lookup_hours', (v_public->'tools')::text
  );
  perform test.m4_assert('invalid public key returns empty config',
    public.ai_get_public_agent('not-a-key') = '{}'::jsonb
  );
  perform test.expect_error('select * from public.ai_agents');
  perform test.expect_error(format($q$select public.ai_upsert_agent(%L::uuid, 'Anon Agent')$q$, v_a));
  perform test.m4_assert('anon cannot read AI tables or write config', true);

  perform test.act_as(v_owner_a, 'm4-owner-a@example.test');
  perform public.ai_set_agent_status(v_a, v_agent, 'paused');
  perform test.act_anon();
  perform test.m4_assert('paused agent is hidden from the public',
    public.ai_get_public_agent(v_public_key) = '{}'::jsonb
  );
  perform test.act_as(v_owner_a, 'm4-owner-a@example.test');
  perform public.ai_set_agent_status(v_a, v_agent, 'active');

  -- 8. Consent gates all outbound follow-ups.
  perform test.act_as(v_manager_a, 'm4-manager-a@example.test');
  perform public.ai_set_consent(v_a, v_contact, 'whatsapp', 'opt_out', 'manual', '{"reason":"customer stop"}'::jsonb);
  perform test.m4_assert('opt-out disables consent', not public.has_consent(v_a, v_contact, 'whatsapp'));
  perform test.expect_error(format(
    $q$select public.ai_enqueue_follow_up(%L::uuid, %L::uuid, %L::uuid, 'whatsapp', null)$q$,
    v_a, v_contact, v_sequence
  ));
  perform test.m4_assert('follow-up without consent is rejected', true);

  perform public.ai_set_consent(v_a, v_contact, 'whatsapp', 'opt_in', 'website_chat', '{"source":"chatbot"}'::jsonb);
  perform test.m4_assert('fresh opt-in enables consent', public.has_consent(v_a, v_contact, 'whatsapp'));

  v_job := public.ai_enqueue_follow_up(v_a, v_contact, v_sequence, 'whatsapp', null);
  v_job_dup := public.ai_enqueue_follow_up(v_a, v_contact, v_sequence, 'whatsapp', null);
  perform test.m4_assert('duplicate follow-up enqueue returns the same job', v_job = v_job_dup, v_job_dup::text);
  select count(*) into v_count
  from public.ai_follow_up_jobs where tenant_id = v_a and contact_id = v_contact and status = 'pending';
  perform test.m4_assert('only one pending first-step job exists', v_count = 1, v_count::text);

  -- 9. Service-role-only RPCs reject member callers before any write.
  perform test.expect_error(format($q$select public.ai_record_webhook_event(%L::uuid, 'whatsapp', 'message', 'denied-1', '{}'::jsonb, true)$q$, v_a));
  perform test.expect_error(format($q$select public.ai_upsert_contact_from_channel(%L::uuid, 'whatsapp')$q$, v_a));
  perform test.expect_error(format($q$select public.ai_find_or_create_conversation(%L::uuid, %L::uuid, %L::uuid)$q$, v_a, v_contact, v_channel));
  perform test.expect_error(format($q$select public.ai_append_message(%L::uuid, %L::uuid, 'inbound', 'denied', 'customer')$q$, v_a, v_conv_dup));
  perform test.expect_error(format($q$select public.ai_record_usage(%L::uuid, %L::uuid, null, 'website_chat', 'openai', 'gpt-test', 'chat', 1, 1, 0, 1, true, null, 'denied')$q$, v_a, v_agent));
  perform test.expect_error(format($q$select public.ai_claim_follow_up_job(%L::uuid)$q$, v_job));
  perform test.expect_error(format($q$select public.ai_upsert_call_session(%L::uuid, 'exotel', 'denied-call')$q$, v_a));
  perform test.m4_assert('provider RPCs are not executable by members', true);

  -- 10. Webhook events dedupe by provider + external id and record verification.
  perform test.act_service();
  v_event := public.ai_record_webhook_event(
    v_a, 'whatsapp', 'messages.received', 'wamid.m4.1', '{"from":"+919876543210"}'::jsonb, true
  );
  v_event_dup := public.ai_record_webhook_event(
    v_a, 'whatsapp', 'messages.received', 'wamid.m4.1', '{"from":"changed"}'::jsonb, true
  );
  perform test.m4_assert('webhook event is deduplicated',
    (v_event_dup->>'is_duplicate')::boolean = true and v_event_dup->>'id' = v_event->>'id',
    v_event_dup::text
  );

  perform test.act_as(v_owner_a, 'm4-owner-a@example.test');
  select count(*) into v_count
  from public.webhook_events
  where id = (v_event->>'id')::uuid and signature_verified = true and status = 'received' and attempts = 1;
  perform test.m4_assert('verified webhook is recorded as received', v_count = 1, v_count::text);

  perform test.act_service();
  v_event_bad := public.ai_record_webhook_event(
    v_a, 'whatsapp', 'messages.received', 'wamid.m4.2', '{}'::jsonb, false
  );
  perform test.act_as(v_owner_a, 'm4-owner-a@example.test');
  select count(*) into v_count
  from public.webhook_events
  where id = (v_event_bad->>'id')::uuid and signature_verified = false and status = 'failed';
  perform test.m4_assert('unverified webhook is recorded as failed', v_count = 1, v_count::text);

  -- 11. Conversation and message dedupe, then follow-up worker claim/complete.
  perform test.act_service();
  v_conv := public.ai_find_or_create_conversation(v_a, v_contact, v_channel);
  v_conv_dup := public.ai_find_or_create_conversation(v_a, v_contact, v_channel);
  perform test.m4_assert('same contact/channel reuses one open conversation', v_conv = v_conv_dup, v_conv_dup::text);

  v_msg := public.ai_append_message(
    v_a, v_conv, 'inbound', 'Do you offer dental cleaning?', 'customer', 'wamid.msg.m4.1', false, '{}'::jsonb
  );
  v_msg_dup := public.ai_append_message(
    v_a, v_conv, 'inbound', 'Duplicate delivery', 'customer', 'wamid.msg.m4.1', false, '{}'::jsonb
  );
  perform test.m4_assert('duplicate provider message returns the same message id', v_msg = v_msg_dup, v_msg_dup::text);

  perform test.act_as(v_owner_a, 'm4-owner-a@example.test');
  select count(*) into v_count
  from public.messages where tenant_id = v_a and provider_message_id = 'wamid.msg.m4.1';
  perform test.m4_assert('only one message row exists for the provider id', v_count = 1, v_count::text);

  perform test.act_service();
  v_payload := public.ai_claim_follow_up_job(v_job);
  perform test.m4_assert('follow-up job payload uses normalized contact data',
    v_payload->>'contact_mobile' = '+919876543210', v_payload::text
  );
  perform test.m4_assert('follow-up job payload includes approved template',
    v_payload->'template'->>'key' = 'm4_followup', v_payload::text
  );
  perform public.ai_complete_follow_up_job(v_job, 'sent', 'provider.followup.1');

  perform test.act_as(v_owner_a, 'm4-owner-a@example.test');
  v_key2 := v_a::text || '|' || v_sequence::text || '|' || v_contact::text || '|' || v_step2::text;
  select id into v_job2
  from public.ai_follow_up_jobs where tenant_id = v_a and idempotency_key = v_key2;
  perform test.m4_assert('sent step schedules the next step exactly once', v_job2 is not null, v_key2);

  perform test.act_as(v_manager_a, 'm4-manager-a@example.test');
  perform public.ai_set_consent(v_a, v_contact, 'whatsapp', 'opt_out', 'manual', '{"reason":"stop follow-ups"}'::jsonb);
  perform test.act_service();
  v_payload := public.ai_claim_follow_up_job(v_job2);
  perform test.m4_assert('revoked-consent job can still be claimed for status handling',
    v_payload->>'job_id' = v_job2::text, v_payload::text
  );
  perform public.ai_complete_follow_up_job(v_job2, 'sent', 'provider.followup.2');
  v_key3 := v_a::text || '|' || v_sequence::text || '|' || v_contact::text || '|' || v_step3::text;
  select count(*) into v_count
  from public.ai_follow_up_jobs where tenant_id = v_a and idempotency_key = v_key3;
  perform test.m4_assert('revoked consent prevents the next follow-up step', v_count = 0, v_count::text);

  -- 12. Usage tracking is service-role only and enforces the agent monthly cap.
  perform test.act_as(v_owner_a, 'm4-owner-a@example.test');
  perform test.m4_assert('agent has monthly usage capacity before logging', public.ai_check_usage_limit(v_a, v_agent));
  perform test.act_service();
  v_usage := public.ai_record_usage(
    v_a, v_agent, v_conv, 'website_chat', 'openai', 'gpt-test', 'chat', 60, 0, 0.01, 120, true, null, 'req.m4.1'
  );
  perform test.m4_assert('service role logs provider usage', v_usage is not null);
  perform test.act_as(v_owner_a, 'm4-owner-a@example.test');
  perform test.m4_assert('usage below cap is allowed', public.ai_check_usage_limit(v_a, v_agent));

  perform test.act_service();
  v_usage2 := public.ai_record_usage(
    v_a, v_agent, v_conv, 'website_chat', 'openai', 'gpt-test', 'chat', 50, 0, 0.01, 90, true, null, 'req.m4.2'
  );
  perform test.m4_assert('second usage row logged', v_usage2 is not null);
  perform test.act_as(v_owner_a, 'm4-owner-a@example.test');
  perform test.m4_assert('monthly token cap blocks further AI use', not public.ai_check_usage_limit(v_a, v_agent));

  perform test.act_as(v_manager_a, 'm4-manager-a@example.test');
  select count(*) into v_count from public.ai_usage_logs where tenant_id = v_a;
  perform test.m4_assert('manager cannot read AI usage logs', v_count = 0, v_count::text);
  perform test.act_as(v_owner_a, 'm4-owner-a@example.test');
  select count(*) into v_count from public.ai_usage_logs where tenant_id = v_a;
  perform test.m4_assert('owner can read AI usage logs', v_count = 2, v_count::text);

  -- 13. Lead assessment records evidence, not invented CRM scores.
  perform test.act_as(v_manager_a, 'm4-manager-a@example.test');
  select lead_score into v_score from public.contacts where id = v_contact;
  v_assessment := public.ai_record_assessment(
    v_a, v_contact, 'high_intent', 'Asked for cleaning price and appointment time.',
    'booking_intent', 'dental cleaning', 'Offer available slots'
  );
  v_latest := public.ai_latest_assessment(v_a, v_contact);
  perform test.m4_assert('assessment is saved with an allowed classification',
    v_assessment is not null and v_latest->>'classification' = 'high_intent', v_latest::text
  );
  select lead_score into v_score_after from public.contacts where id = v_contact;
  perform test.m4_assert('AI assessment does not invent or change lead score', v_score_after = v_score, format('%s vs %s', v_score, v_score_after));
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'ai_lead_assessments' and column_name = 'lead_score';
  perform test.m4_assert('assessment table has no invented score column', v_count = 0, v_count::text);
  perform test.expect_error(format(
    $q$select public.ai_record_assessment(%L::uuid, %L::uuid, 'super_score_100', 'Invalid')$q$,
    v_a, v_contact
  ));
  perform test.m4_assert('invalid assessment classification is rejected', true);

  perform test.act_as(v_owner_b, 'm4-owner-b@example.test');
  perform test.expect_error(format(
    $q$select public.ai_latest_assessment(%L::uuid, %L::uuid)$q$, v_a, v_contact
  ));
  perform test.m4_assert('cross-tenant assessment read is rejected', true);

  -- 14. Handoff pauses automation and blocks further AI-generated replies.
  perform test.act_as(v_manager_a, 'm4-manager-a@example.test');
  perform public.ai_set_consent(v_a, v_contact, 'whatsapp', 'opt_in', 'staff', '{"reason":"handoff test"}'::jsonb);
  v_handoff := public.ai_handoff_conversation(
    v_a, v_conv, v_manager_a, 'Clinical question', 'Escalate to a human.'
  );
  perform test.m4_assert('human handoff is recorded', v_handoff is not null);
  select count(*) into v_count
  from public.conversations
  where id = v_conv and tenant_id = v_a and ai_status = 'handed_off' and assigned_to = v_manager_a;
  perform test.m4_assert('conversation is assigned and AI status is handed_off', v_count = 1, v_count::text);
  select count(*) into v_count
  from public.notifications
  where tenant_id = v_a and user_id = v_manager_a and entity_id = v_conv;
  perform test.m4_assert('handoff creates a staff notification', v_count > 0, v_count::text);

  perform test.expect_error(format(
    $q$select public.ai_enqueue_follow_up(%L::uuid, %L::uuid, %L::uuid, 'whatsapp', %L::uuid)$q$,
    v_a, v_contact, v_sequence, v_conv
  ));
  perform test.m4_assert('follow-up enqueue is blocked after handoff', true);

  perform test.act_service();
  perform test.expect_error(format(
    $q$select public.ai_append_message(%L::uuid, %L::uuid, 'outbound', 'AI should not reply', 'bot', null, true, '{}'::jsonb)$q$,
    v_a, v_conv
  ));
  perform test.m4_assert('AI-generated reply is blocked after handoff', true);

  perform test.act_as(v_owner_b, 'm4-owner-b@example.test');
  perform test.expect_error(format(
    $q$select public.ai_handoff_conversation(%L::uuid, %L::uuid, %L::uuid)$q$,
    v_a, v_conv, v_owner_b
  ));
  perform test.m4_assert('cross-tenant handoff is rejected', true);

  -- 15. Inbound voice foundation records provider call sessions idempotently.
  perform test.act_service();
  v_session := public.ai_upsert_call_session(
    v_a, 'exotel', 'call.m4.1', 'inbound', '+91 98765 43210', '+91 80000 00001',
    'in_progress', v_contact, v_conv, '{"provider":"exotel"}'::jsonb
  );
  v_session2 := public.ai_upsert_call_session(
    v_a, 'exotel', 'call.m4.1', 'inbound', null, null,
    'completed', null, null, '{"provider":"exotel","completed":true}'::jsonb
  );
  perform test.m4_assert('call provider id reuses the same session', v_session = v_session2, v_session2::text);

  perform test.act_as(v_owner_a, 'm4-owner-a@example.test');
  select count(*) into v_count
  from public.ai_call_sessions
  where id = v_session and tenant_id = v_a and direction = 'inbound' and status = 'completed';
  perform test.m4_assert('inbound call session is stored with final status', v_count = 1, v_count::text);
end;
$$;

select count(*) as checks_passed from test.m4_results;

rollback;
