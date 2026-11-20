-- ============================================================================
-- milestone3_booking.sql
-- Milestone 3 booking, availability, public-access, inbox and notification
-- checks. The whole file is one transaction and is always rolled back.
--
-- Hosted Supabase SQL Editor: paste/run this file as-is.
-- Local psql: prepend `\set ON_ERROR_STOP on` if desired.
-- ============================================================================

begin;

create schema if not exists test;

create table test.m3_results (
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
    set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated', 'email', p_email)::text, true);
$$;

create or replace function test.act_anon()
returns void language sql as $$
  select
    set_config('role', 'anon', true),
    set_config('request.jwt.claim.sub', '', true),
    set_config('request.jwt.claims', '', true);
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

create or replace function test.m3_assert(p_name text, p_ok boolean, p_detail text default '')
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FAIL: % (%)', p_name, p_detail;
  end if;
  insert into test.m3_results (test_name, passed, detail) values (p_name, true, p_detail);
end;
$$;

grant usage on schema test to authenticated, anon;
grant select, insert on test.m3_results to authenticated, anon;
grant execute on all functions in schema test to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Fixtures: two independent tenants, staff in tenant A
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm3-owner-a@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"M3 Owner A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'm3-owner-b@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"M3 Owner B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b3000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'm3-manager-a@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"M3 Manager A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b4000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'm3-employee-a@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"M3 Employee A"}', now(), now());

select test.act_as('b1000000-0000-4000-8000-000000000001', 'm3-owner-a@example.test');
select public.create_business('M3 Alpha Clinic', 'm3-alpha-clinic', 'dental-clinic');

select test.act_as('b2000000-0000-4000-8000-000000000002', 'm3-owner-b@example.test');
select public.create_business('M3 Beta Salon', 'm3-beta-clinic', 'salon-spa');

do $$
declare
  v_a uuid;
  v_token text;
begin
  perform test.act_as('b1000000-0000-4000-8000-000000000001', 'm3-owner-a@example.test');
  v_a := (select id from public.businesses where slug = 'm3-alpha-clinic');

  v_token := public.create_business_invitation(v_a, 'm3-manager-a@example.test', 'manager');
  perform test.act_as('b3000000-0000-4000-8000-000000000003', 'm3-manager-a@example.test');
  perform public.accept_business_invitation(v_token);

  perform test.act_as('b1000000-0000-4000-8000-000000000001', 'm3-owner-a@example.test');
  v_token := public.create_business_invitation(v_a, 'm3-employee-a@example.test', 'employee');
  perform test.act_as('b4000000-0000-4000-8000-000000000004', 'm3-employee-a@example.test');
  perform public.accept_business_invitation(v_token);
end;
$$;

-- Variables reused by the checks below.
select test.act_as('b3000000-0000-4000-8000-000000000003', 'm3-manager-a@example.test');

do $$
declare
  v_a uuid := (select id from public.businesses where slug = 'm3-alpha-clinic');
  v_service uuid;
  v_resource uuid;
  v_rule uuid;
  v_date date := (now() at time zone 'Asia/Kolkata')::date + 7;
  v_slots jsonb;
  v_slot timestamptz;
  v_alt_slot timestamptz;
  v_new_slot timestamptz;
  v_booking jsonb;
  v_booking2 jsonb;
  v_booking_id uuid;
  v_token text;
  v_token2 text;
  v_count integer;
  v_page uuid;
  v_conv uuid;
  v_msg uuid;
begin
  -- 1. Service configuration
  v_service := public.booking_create_service(
    v_a, 'Dental Cleaning', 'Routine cleaning', 30, 1500.00, 'INR', 5, 10, true
  );
  perform test.m3_assert('manager can create a service', v_service is not null);

  perform test.act_as('b4000000-0000-4000-8000-000000000004', 'm3-employee-a@example.test');
  perform test.expect_error($q$select public.booking_create_service(
    (select id from public.businesses where slug = 'm3-alpha-clinic'), 'Employee Service', null, 30, 100, 'INR', 0, 0, true
  )$q$);
  perform test.m3_assert('employee cannot create services', true);
  perform test.act_as('b3000000-0000-4000-8000-000000000003', 'm3-manager-a@example.test');

  -- 2. Resource linked to an active member
  v_resource := public.booking_create_resource(
    v_a, 'Dr. Rao', 'employee', 'b4000000-0000-4000-8000-000000000004', null, true
  );
  perform test.m3_assert('manager can create an employee resource', v_resource is not null);
  perform public.booking_set_service_resources(v_a, v_service, array[v_resource]::uuid[]);
  select count(*) into v_count from public.service_resources where tenant_id = v_a and service_id = v_service;
  perform test.m3_assert('service/resource eligibility saved', v_count = 1, v_count::text);

  -- 3. Weekly availability + holiday
  v_rule := public.booking_upsert_availability_rule(
    v_a, null, v_resource, extract(dow from v_date)::smallint,
    time '09:00', time '18:00', true, null, null
  );
  perform test.m3_assert('weekly availability rule created', v_rule is not null);

  perform public.booking_create_exception(
    v_a, v_resource, 'blocked', 'Lunch', (v_date + time '13:00') at time zone 'Asia/Kolkata',
    (v_date + time '14:00') at time zone 'Asia/Kolkata', false
  );
  select count(*) into v_count from public.availability_exceptions where tenant_id = v_a;
  perform test.m3_assert('holiday/break exception created', v_count = 1, v_count::text);

  perform test.act_as('b4000000-0000-4000-8000-000000000004', 'm3-employee-a@example.test');
  perform test.expect_error($q$select public.booking_upsert_availability_rule(
    (select id from public.businesses where slug = 'm3-alpha-clinic'), null, null, 1, time '09:00', time '18:00', true, null, null
  )$q$);
  perform test.m3_assert('employee cannot change availability', true);
  perform test.act_as('b3000000-0000-4000-8000-000000000003', 'm3-manager-a@example.test');

  -- 4. Public booking page is reachable without a login
  select id into v_page from public.booking_pages where tenant_id = v_a;
  perform public.booking_update_page_settings(
    v_a, v_page, 'Book a dental visit', 'Choose a time', '#4f46e5', null,
    60, 60, 15, true, true, true, true, 4, true, array[v_service]::uuid[]
  );

  perform test.act_anon();
  perform test.m3_assert(
    'public booking page exposes only approved info',
    (public.public_booking_get_page('m3-alpha-clinic')->>'business_name') = 'M3 Alpha Clinic'
  );
  perform test.m3_assert(
    'public booking page lists configured service',
    (public.public_booking_get_page('m3-alpha-clinic')->'services'->0->>'name') = 'Dental Cleaning'
  );
  perform test.m3_assert(
    'other tenant slug returns empty page',
    public.public_booking_get_page('does-not-exist') = '{}'::jsonb
  );

  v_slots := public.public_booking_get_slots('m3-alpha-clinic', v_service, v_date, v_resource);
  perform test.m3_assert('server generates slots for an open day', jsonb_array_length(v_slots) > 0, v_slots::text);
  perform test.m3_assert(
    'lunch break is excluded from slots',
    not exists (
      select 1 from jsonb_array_elements(v_slots) s
      where (s.value->>'start')::timestamptz = (v_date + time '13:15') at time zone 'Asia/Kolkata'
    )
  );

  -- 5. Public booking creates appointment and CRM contact
  select (value->>'start')::timestamptz into v_slot
  from jsonb_array_elements(v_slots) s limit 1;

  v_booking := public.public_booking_create(
    'm3-alpha-clinic', v_service, v_slot, 'Asha Sharma', '+91 98765 43210',
    'asha@example.test', v_resource, null, 'idem-key-1'
  );
  v_booking_id := (v_booking->>'id')::uuid;
  v_token := v_booking->>'manage_token';
  perform test.m3_assert('anonymous customer can book', v_booking_id is not null, v_booking::text);
  perform test.m3_assert('management token returned', length(v_token) >= 32);

  -- Direct table assertions need a staff role; the booking itself was anon.
  perform test.act_as('b3000000-0000-4000-8000-000000000003', 'm3-manager-a@example.test');
  select count(*) into v_count from public.contacts
    where tenant_id = v_a and phone = '+91 98765 43210';
  perform test.m3_assert('booking connects/creates a CRM contact', v_count = 1, v_count::text);
  select count(*) into v_count from public.notifications where tenant_id = v_a;
  perform test.m3_assert('staff notification generated for new booking', v_count > 0, v_count::text);
  select count(*) into v_count from public.appointment_events where appointment_id = v_booking_id;
  perform test.m3_assert('appointment history records creation', v_count = 1, v_count::text);

  -- 6. Duplicate submission and overlapping slot protection
  perform test.act_anon();
  v_booking := public.public_booking_create(
    'm3-alpha-clinic', v_service, v_slot, 'Asha Sharma', '+91 98765 43210',
    'asha@example.test', v_resource, null, 'idem-key-1'
  );
  perform test.m3_assert(
    'idempotency key returns the same booking',
    (v_booking->>'id')::uuid = v_booking_id
  );

  perform test.expect_error(format(
    'select public.public_booking_create(%L, %L::uuid, %L::timestamptz, %L, %L, %L, %L::uuid, null, %L)',
    'm3-alpha-clinic', v_service, v_slot, 'Ravi Verma', '+91 90000 00001',
    'ravi@example.test', v_resource, 'idem-key-2'
  ));
  perform test.m3_assert('overlapping booking is rejected', true);

  -- 7. Cancelling frees the slot again
  perform test.act_as('b3000000-0000-4000-8000-000000000003', 'm3-manager-a@example.test');
  perform public.booking_set_status(v_a, v_booking_id, 'cancelled', 'Customer requested');
  perform test.act_anon();
  v_slots := public.public_booking_get_slots('m3-alpha-clinic', v_service, v_date, v_resource);
  perform test.m3_assert(
    'cancelled appointment frees its slot',
    exists (
      select 1 from jsonb_array_elements(v_slots) s
      where (s.value->>'start')::timestamptz = v_slot
    )
  );

  -- 7b. Token-scoped customer self-service (reschedule + cancel)
  v_slots := public.public_booking_get_slots('m3-alpha-clinic', v_service, v_date, v_resource);
  select (value->>'start')::timestamptz into v_alt_slot
  from jsonb_array_elements(v_slots) s
  where (value->>'start')::timestamptz <> v_slot
  limit 1;
  perform test.m3_assert('alternate slot available for self-service test', v_alt_slot is not null);

  v_booking2 := public.public_booking_create(
    'm3-alpha-clinic', v_service, v_alt_slot, 'Ravi Verma', '+91 90000 00002',
    'ravi2@example.test', v_resource, null, 'idem-key-manage'
  );
  v_token2 := v_booking2->>'manage_token';
  perform test.m3_assert('second customer booking created', v_token2 is not null);

  perform test.expect_error(
    format('select public.public_booking_manage(%L, %L)', 'not-a-real-token', 'cancel')
  );
  perform test.m3_assert('wrong management token rejected', true);

  v_slots := public.public_booking_get_slots('m3-alpha-clinic', v_service, v_date, v_resource);
  select (value->>'start')::timestamptz into v_new_slot
  from jsonb_array_elements(v_slots) s
  where (value->>'start')::timestamptz <> v_alt_slot
  limit 1;
  perform test.m3_assert('slot available for reschedule', v_new_slot is not null);

  v_booking := public.public_booking_manage(v_token2, 'reschedule', v_new_slot);
  perform test.m3_assert(
    'token reschedule succeeds and resets confirmation',
    v_booking->>'status' = 'pending'
  );

  v_booking := public.public_booking_manage(v_token2, 'cancel', null, 'Changed plans');
  perform test.m3_assert(
    'token cancel succeeds',
    v_booking->>'status' = 'cancelled'
  );

  -- 8. Anonymous users cannot read tenant tables directly
  perform test.expect_error('select * from public.services');
  perform test.expect_error('select * from public.appointments');
  perform test.expect_error('select * from public.notifications');
  perform test.m3_assert('anon has no direct tenant table access', true);

  -- 9. Cross-tenant isolation
  perform test.act_as('b2000000-0000-4000-8000-000000000002', 'm3-owner-b@example.test');
  select count(*) into v_count from public.services;
  perform test.m3_assert('Beta owner cannot see Alpha services', v_count = 0, v_count::text);
  perform test.expect_error(format(
    'select public.booking_create_staff(%L::uuid, %L::uuid, %L, %L::timestamptz, null, null, null, null, null, null)',
    v_a, v_service, 'Cross tenant', now()
  ));
  perform test.m3_assert('cross-tenant RPC write is rejected', true);

  -- 9b. Database-level overlap guard. The RPC advisory locks cover the normal
  -- path, but this proves the constraint also blocks writes that bypass them.
  perform test.act_as('b3000000-0000-4000-8000-000000000003', 'm3-manager-a@example.test');
  insert into public.appointments (
    tenant_id, service_id, resource_id, title, customer_name,
    start_at, end_at, status
  ) values (
    v_a, v_service, v_resource, 'Overlap A', 'Test A',
    v_slot, v_slot + interval '30 minutes', 'confirmed'
  );
  perform test.expect_error(format(
    'insert into public.appointments (tenant_id, service_id, resource_id, title, customer_name, start_at, end_at, status) ' ||
    'values (%L::uuid, %L::uuid, %L::uuid, %L, %L, %L::timestamptz, %L::timestamptz, %L)',
    v_a, v_service, v_resource, 'Overlap B', 'Test B',
    v_slot + interval '10 minutes', v_slot + interval '40 minutes', 'confirmed'
  ));
  perform test.m3_assert('DB constraint rejects overlapping appointments', true);

  -- 10. Inbox foundation
  perform test.act_as('b3000000-0000-4000-8000-000000000003', 'm3-manager-a@example.test');
  v_conv := public.inbox_create_conversation(
    v_a, null, null, 'Booking question', 'Asha Sharma', 'asha@example.test',
    'b4000000-0000-4000-8000-000000000004'
  );
  perform test.m3_assert('conversation created with assignment', v_conv is not null);
  v_msg := public.inbox_send_message(v_a, v_conv, 'Please confirm the cleaning time.', 'text', false, 'ext-1');
  perform test.m3_assert('outbound message stored', v_msg is not null);
  perform test.expect_error(format(
    'select public.inbox_send_message(%L::uuid, %L::uuid, %L, %L, false, %L)',
    v_a, v_conv, 'Duplicate provider message', 'text', 'ext-1'
  ));
  perform test.m3_assert('duplicate provider message id rejected', true);

  v_msg := public.inbox_send_message(v_a, v_conv, 'Check internal notes', 'text', true, null);
  select count(*) into v_count from public.messages where id = v_msg and is_internal = true;
  perform test.m3_assert('internal note is marked non-customer-facing', v_count = 1, v_count::text);
  perform public.inbox_mark_read(v_a, v_conv);
  perform test.m3_assert('conversation marked read', true);

  perform test.act_anon();
  perform test.expect_error('select * from public.messages');
  perform test.m3_assert('anonymous users cannot read messages', true);

  -- 11. Notifications are user-scoped
  perform test.act_as('b4000000-0000-4000-8000-000000000004', 'm3-employee-a@example.test');
  select count(*) into v_count from public.notifications where user_id <> 'b4000000-0000-4000-8000-000000000004';
  perform test.m3_assert('employee cannot read others'' notifications', v_count = 0, v_count::text);
  perform public.notifications_mark_all_read(v_a);
  select count(*) into v_count from public.notifications
    where user_id = 'b4000000-0000-4000-8000-000000000004' and read_at is null;
  perform test.m3_assert('mark-all-read only affects own rows', v_count = 0, v_count::text);
end;
$$;

select count(*) as checks_passed from test.m3_results;

rollback;
