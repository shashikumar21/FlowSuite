-- ============================================================================
-- crm_lead_enrichment.sql
-- M3.1 lead columns: create/update round-trip, search, export, CHECK limits,
-- import parsing/normalisation and cross-tenant isolation.
--
-- Run against a local Supabase database:
--   psql "$DATABASE_URL" -f supabase/tests/crm_lead_enrichment.sql
--
-- Hosted Supabase SQL Editor: paste/run this file as-is.
-- The whole file is one transaction and is always rolled back.
-- A passing run reports the number of checks in the final checks_passed row.
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

grant usage on schema test to authenticated;
grant select, insert on test.m3_results to authenticated;
grant execute on all functions in schema test to authenticated;

-- ----------------------------------------------------------------------------
-- Fixtures: two isolated tenants, each with its own owner.
-- ----------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm31-owner-a@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"M31 Owner A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'm31-owner-b@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"M31 Owner B"}', now(), now());

select test.act_as('c1000000-0000-4000-8000-000000000001', 'm31-owner-a@example.test');
select public.create_business('M31 Alpha Clinic', 'm31-alpha-clinic', 'dental-clinic');

select test.act_as('c2000000-0000-4000-8000-000000000002', 'm31-owner-b@example.test');
select public.create_business('M31 Beta Salon', 'm31-beta-salon', 'salon-spa');

-- ----------------------------------------------------------------------------
-- Checks
-- ----------------------------------------------------------------------------

do $$
declare
  v_a uuid;
  v_b uuid;
  v_owner_a uuid := 'c1000000-0000-4000-8000-000000000001';
  v_owner_b uuid := 'c2000000-0000-4000-8000-000000000002';
  v_contact uuid;
  v_job uuid;
  v_batch jsonb;
  v_count integer;
  v_clinic text;
  v_area text;
  v_mobile text;
  v_rating numeric;
  v_reviews integer;
  v_why text;
  v_maps text;
  v_sent boolean;
  v_reply text;
begin
  -- Business IDs must be read while acting as that business's owner: RLS hides
  -- the other tenant. Defaults on the declarations would run before the role
  -- switch and resolve to NULL.
  perform test.act_as(v_owner_a, 'm31-owner-a@example.test');
  v_a := (select id from public.businesses where slug = 'm31-alpha-clinic');
  perform test.act_as(v_owner_b, 'm31-owner-b@example.test');
  v_b := (select id from public.businesses where slug = 'm31-beta-salon');
  perform test.act_as(v_owner_a, 'm31-owner-a@example.test');

  -- 1. create_contact with all nine new parameters.
  v_contact := public.create_contact(
    v_a, 'Meera', 'Iyer', 'meera.m31@example.test', '9000000001',
    'Smile Dental', null, null, 'Initial enquiry', null, 'new',
    'Smile Dental Andheri', 'Andheri West', '98765 43210', 4.5, 120,
    'High google rating', 'https://maps.example.test/smile', true,
    'Call back tomorrow'
  );
  perform test.m3_assert('create_contact accepts all nine lead fields', v_contact is not null, coalesce(v_contact::text, 'null'));

  select c.clinic, c.area, c.mobile, c.rating, c.reviews, c.why_included,
         c.google_maps_url, c.sent, c.reply_1
    into v_clinic, v_area, v_mobile, v_rating, v_reviews, v_why, v_maps, v_sent, v_reply
  from public.contacts c
  where c.tenant_id = v_a and c.id = v_contact;
  perform test.m3_assert(
    'create_contact stores all nine lead fields',
    v_clinic = 'Smile Dental Andheri'
      and v_area = 'Andheri West'
      and v_mobile = '+919876543210'
      and v_rating = 4.5
      and v_reviews = 120
      and v_why = 'High google rating'
      and v_maps = 'https://maps.example.test/smile'
      and v_sent is true
      and v_reply = 'Call back tomorrow',
    format('%s|%s|%s|%s|%s|%s|%s|%s|%s', v_clinic, v_area, v_mobile, v_rating,
           v_reviews, v_why, v_maps, v_sent, v_reply)
  );

  -- 2. update_contact round-trip (mobile is normalised here too).
  perform public.update_contact(
    v_a, v_contact, 'Meera', 'Iyer', 'meera.m31@example.test', '9000000001',
    'Smile Dental', 'Follow-up done', 'qualified', null, null,
    'Smile Dental Bandra', 'Bandra West', '+91 98765 43211', 4.7, 121,
    'Referred by patient', 'https://maps.example.test/bandra', false,
    'Visit scheduled'
  );
  select c.clinic, c.area, c.mobile, c.rating, c.reviews, c.why_included,
         c.google_maps_url, c.sent, c.reply_1
    into v_clinic, v_area, v_mobile, v_rating, v_reviews, v_why, v_maps, v_sent, v_reply
  from public.contacts c
  where c.tenant_id = v_a and c.id = v_contact;
  perform test.m3_assert(
    'update_contact round-trips all nine lead fields',
    v_clinic = 'Smile Dental Bandra'
      and v_area = 'Bandra West'
      and v_mobile = '+919876543211'
      and v_rating = 4.7
      and v_reviews = 121
      and v_why = 'Referred by patient'
      and v_maps = 'https://maps.example.test/bandra'
      and v_sent is false
      and v_reply = 'Visit scheduled',
    format('%s|%s|%s|%s|%s|%s|%s|%s|%s', v_clinic, v_area, v_mobile, v_rating,
           v_reviews, v_why, v_maps, v_sent, v_reply)
  );

  -- 3. crm_search_contacts returns the new columns.
  select s.clinic, s.area, s.mobile, s.rating, s.reviews, s.why_included,
         s.google_maps_url, s.sent, s.reply_1
    into v_clinic, v_area, v_mobile, v_rating, v_reviews, v_why, v_maps, v_sent, v_reply
  from public.crm_search_contacts(v_a) s
  where s.id = v_contact;
  perform test.m3_assert(
    'crm_search_contacts exposes all nine lead fields',
    v_clinic = 'Smile Dental Bandra'
      and v_area = 'Bandra West'
      and v_mobile = '+919876543211'
      and v_rating = 4.7
      and v_reviews = 121
      and v_why = 'Referred by patient'
      and v_maps = 'https://maps.example.test/bandra'
      and v_sent is false
      and v_reply = 'Visit scheduled',
    format('%s|%s|%s|%s|%s|%s|%s|%s|%s', v_clinic, v_area, v_mobile, v_rating,
           v_reviews, v_why, v_maps, v_sent, v_reply)
  );

  -- 4. Fuzzy search reaches the enriched fields.
  select count(*) into v_count from public.crm_search_contacts(v_a, 'Bandra West');
  perform test.m3_assert('enriched area is searchable', v_count = 1, v_count::text);
  select count(*) into v_count from public.crm_search_contacts(v_a, '+919876543211');
  perform test.m3_assert('normalised mobile is searchable', v_count = 1, v_count::text);

  -- 5. CHECK constraints reject out-of-range values.
  perform test.expect_error(format('update public.contacts set rating = 6 where id = %L', v_contact));
  perform test.m3_assert('rating CHECK rejects values above 5', true);
  perform test.expect_error(format('update public.contacts set reviews = -1 where id = %L', v_contact));
  perform test.m3_assert('reviews CHECK rejects negative values', true);

  -- 6. crm_export_rows returns the nine fields.
  select e.clinic, e.area, e.mobile, e.rating, e.reviews, e.why_included,
         e.google_maps_url, e.sent, e.reply_1
    into v_clinic, v_area, v_mobile, v_rating, v_reviews, v_why, v_maps, v_sent, v_reply
  from public.crm_export_rows(v_a, 'contacts') e
  where e.id = v_contact;
  perform test.m3_assert(
    'crm_export_rows exposes all nine lead fields',
    v_clinic = 'Smile Dental Bandra'
      and v_area = 'Bandra West'
      and v_mobile = '+919876543211'
      and v_rating = 4.7
      and v_reviews = 121
      and v_why = 'Referred by patient'
      and v_maps = 'https://maps.example.test/bandra'
      and v_sent is false
      and v_reply = 'Visit scheduled',
    format('%s|%s|%s|%s|%s|%s|%s|%s|%s', v_clinic, v_area, v_mobile, v_rating,
           v_reviews, v_why, v_maps, v_sent, v_reply)
  );

  -- 7. Import friendly headers and normalisation/validation.
  v_job := public.crm_start_import(v_a, 'leads', 'm31-leads.csv', 120, 'm31-lead-hash-01', 'new', 1);
  v_batch := public.crm_process_import_batch(v_job, 0, jsonb_build_array(
    jsonb_build_object(
      'rowNumber', '1',
      'first_name', 'Imported',
      'last_name', 'Lead',
      'clinic', 'Lakeview Dental',
      'area', 'Powai',
      'mobile (+91)', '9876543210',
      'rating', '4.5',
      'reviews', '88',
      'why_included', 'Map listing',
      'google maps url', 'https://maps.example.test/lakeview',
      'sent', 'Y',
      'reply 1', 'Yes interested'
    )
  ));
  perform test.m3_assert('import batch parses friendly lead headers', v_batch ->> 'created' = '1', v_batch::text);
  perform test.m3_assert(
    'import normalises mobile in the per-row result',
    v_batch -> 'results' -> 0 ->> 'mobile' = '+919876543210',
    v_batch::text
  );
  perform test.m3_assert(
    'import parses sent Y as true',
    (v_batch -> 'results' -> 0 ->> 'sent')::boolean is true,
    v_batch::text
  );

  select c.clinic, c.area, c.mobile, c.rating, c.reviews, c.why_included,
         c.google_maps_url, c.sent, c.reply_1
    into v_clinic, v_area, v_mobile, v_rating, v_reviews, v_why, v_maps, v_sent, v_reply
  from public.contacts c
  where c.tenant_id = v_a and c.first_name = 'Imported' and c.last_name = 'Lead';
  perform test.m3_assert(
    'imported lead fields are persisted',
    v_clinic = 'Lakeview Dental'
      and v_area = 'Powai'
      and v_mobile = '+919876543210'
      and v_rating = 4.5
      and v_reviews = 88
      and v_why = 'Map listing'
      and v_maps = 'https://maps.example.test/lakeview'
      and v_sent is true
      and v_reply = 'Yes interested',
    format('%s|%s|%s|%s|%s|%s|%s|%s|%s', coalesce(v_clinic, 'null'),
           coalesce(v_area, 'null'), coalesce(v_mobile, 'null'), v_rating,
           v_reviews, coalesce(v_why, 'null'), coalesce(v_maps, 'null'), v_sent,
           coalesce(v_reply, 'null'))
  );

  -- 8. Cross-tenant isolation.
  perform test.act_as(v_owner_b, 'm31-owner-b@example.test');
  select count(*) into v_count
  from public.crm_search_contacts(v_a) s where s.id = v_contact;
  perform test.m3_assert('second tenant cannot see the enriched contact', v_count = 0, v_count::text);
  select count(*) into v_count
  from public.crm_export_rows(v_a, 'contacts') e where e.id = v_contact;
  perform test.m3_assert('second tenant cannot export the enriched contact', v_count = 0, v_count::text);
  select count(*) into v_count from public.contacts c where c.tenant_id = v_a and c.id = v_contact;
  perform test.m3_assert('RLS hides the other tenant contact from direct reads', v_count = 0, v_count::text);

  perform test.expect_error(format(
    'select public.update_contact(%L, %L, %L)', v_a, v_contact, 'Hacked'
  ));
  perform test.m3_assert('second tenant cannot update the enriched contact', true);
end;
$$;

select count(*) as checks_passed from test.m3_results;

rollback;
