-- ============================================================================
-- ai_sales_agent.sql
-- Phase 2: tenant-scoped prospect CRUD, duplicate prevention, saved searches,
-- batch import, real dashboard counts, server-side suppression and cross-tenant
-- isolation. Requires migration 0017_ai_sales_agent.sql to be applied locally.
--
-- Run against a local Supabase database:
--   psql "$DATABASE_URL" -f supabase/tests/ai_sales_agent.sql
--
-- Do NOT run this against the hosted project. The whole file is one
-- transaction and is always rolled back. A passing run reports the number of
-- checks in the final checks_passed row; any failure raises an exception.
-- ============================================================================

begin;

create schema if not exists test;

create table test.sa_results (
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

create or replace function test.sa_assert(p_name text, p_ok boolean, p_detail text default '')
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FAIL: % (%)', p_name, p_detail;
  end if;
  insert into test.sa_results (test_name, passed, detail) values (p_name, true, p_detail);
end;
$$;

-- Test helpers are SECURITY DEFINER so fixtures can be written to tables that
-- intentionally have no direct client INSERT policy.
create or replace function test.add_suppression(p_tenant uuid, p_email text)
returns void language sql security definer set search_path = '' as $$
  insert into public.suppression_list (tenant_id, email, reason)
  values (p_tenant, lower(btrim(p_email)), 'manual');
$$;

create or replace function test.add_verification(
  p_tenant uuid, p_entity uuid, p_status text, p_method text, p_checked_by uuid
)
returns void language sql security definer set search_path = '' as $$
  insert into public.contact_verifications (tenant_id, entity_type, entity_id, method, status, checked_by)
  values (p_tenant, 'prospect', p_entity, p_method, p_status, p_checked_by);
$$;

grant usage on schema test to authenticated;
grant select, insert on test.sa_results to authenticated;
grant execute on all functions in schema test to authenticated;

-- ----------------------------------------------------------------------------
-- Fixtures: two isolated tenants, each with its own owner.
-- ----------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'sa-owner-a@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"SA Owner A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'sa-owner-b@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"SA Owner B"}', now(), now());

select test.act_as('d1000000-0000-4000-8000-000000000001', 'sa-owner-a@example.test');
select public.create_business('SA Alpha Clinic', 'sa-alpha-clinic', 'dental-clinic');

select test.act_as('d2000000-0000-4000-8000-000000000002', 'sa-owner-b@example.test');
select public.create_business('SA Beta Salon', 'sa-beta-salon', 'salon-spa');

-- ----------------------------------------------------------------------------
-- Checks
-- ----------------------------------------------------------------------------

do $$
declare
  v_owner_a uuid := 'd1000000-0000-4000-8000-000000000001';
  v_owner_b uuid := 'd2000000-0000-4000-8000-000000000002';
  v_a uuid;
  v_b uuid;
  v_prospect uuid;
  v_contact uuid;
  v_imported uuid;
  v_duplicate uuid;
  v_search uuid;
  v_batch jsonb;
  v_metrics jsonb;
  v_website text;
  v_email text;
  v_verification text;
  v_lead text;
  v_provider text;
  v_count integer;
begin
  perform test.act_as(v_owner_a, 'sa-owner-a@example.test');
  v_a := (select id from public.businesses where slug = 'sa-alpha-clinic');
  perform test.act_as(v_owner_b, 'sa-owner-b@example.test');
  v_b := (select id from public.businesses where slug = 'sa-beta-salon');
  perform test.act_as(v_owner_a, 'sa-owner-a@example.test');

  -- 1. Create stores normalised values and never marks an email verified.
  v_prospect := public.sales_create_prospect(
    p_tenant => v_a,
    p_business_name => 'Smile Dental Clinic',
    p_industry => 'Dental',
    p_city => 'Mumbai',
    p_country => 'India',
    p_website => 'https://www.Example.com/',
    p_contact_person => 'Dr. Sharma',
    p_email => 'Hello@Example.test',
    p_phone => '9876543210',
    p_source => 'manual'
  );
  perform test.sa_assert('create prospect returns an id', v_prospect is not null, coalesce(v_prospect::text, 'null'));

  select p.website, p.email, p.verification_status, p.lead_status
    into v_website, v_email, v_verification, v_lead
  from public.prospects p
  where p.tenant_id = v_a and p.id = v_prospect;
  perform test.sa_assert(
    'website normalised, email lowercased, unverified and new',
    v_website = 'example.com'
      and v_email = 'hello@example.test'
      and v_verification = 'unverified'
      and v_lead = 'new',
    format('%s|%s|%s|%s', v_website, v_email, v_verification, v_lead)
  );

  -- 2. Duplicate lookup and database-backed rejection.
  v_duplicate := public.sales_find_duplicate_prospect(
    p_tenant => v_a,
    p_email => 'hello@example.test',
    p_website => 'example.com',
    p_business_name => 'Smile Dental Clinic',
    p_city => 'Mumbai',
    p_country => 'India'
  );
  perform test.sa_assert('duplicate lookup finds the existing prospect', v_duplicate = v_prospect, coalesce(v_duplicate::text, 'null'));

  perform test.expect_error(format(
    'select public.sales_create_prospect(p_tenant => %L, p_business_name => %L, p_email => %L)',
    v_a, 'Smile Dental Clinic', 'hello@example.test'
  ));
  perform test.sa_assert('duplicate email insertion is rejected', true);

  -- 3. Update round-trip.
  perform public.sales_update_prospect(
    p_tenant => v_a,
    p_prospect => v_prospect,
    p_business_name => 'Smile Dental Andheri',
    p_city => 'Andheri West',
    p_country => 'India',
    p_website => 'smile.example.com',
    p_email => 'smile@example.test',
    p_notes => 'Referred by a patient'
  );
  select p.website, p.email, p.notes into v_website, v_email, v_lead
  from public.prospects p where p.tenant_id = v_a and p.id = v_prospect;
  perform test.sa_assert(
    'update round-trips changed fields',
    v_website = 'smile.example.com' and v_email = 'smile@example.test' and v_lead = 'Referred by a patient',
    format('%s|%s|%s', v_website, v_email, v_lead)
  );

  -- 4. Lead status change.
  perform public.sales_set_prospect_lead_status(v_a, v_prospect, 'qualified');
  select p.lead_status into v_lead from public.prospects p where p.id = v_prospect;
  perform test.sa_assert('lead status changes', v_lead = 'qualified', coalesce(v_lead, 'null'));

  -- 5. Saved search records criteria only; no provider call and no results.
  v_search := public.sales_save_search(
    p_tenant => v_a,
    p_name => 'Dental clinics in Mumbai',
    p_criteria => '{"industry":"Dental","city":"Mumbai"}'::jsonb
  );
  select s.provider, s.result_count into v_provider, v_count
  from public.prospect_searches s where s.id = v_search and s.tenant_id = v_a;
  perform test.sa_assert(
    'saved search is manual with zero results',
    v_provider = 'manual' and v_count = 0,
    format('%s|%s', v_provider, v_count)
  );

  -- 6. Batch import: one created, one duplicate, one invalid row.
  v_batch := public.sales_import_prospects(
    p_tenant => v_a,
    p_rows => jsonb_build_array(
      jsonb_build_object('business_name', 'Bright Smile Clinic', 'email', 'bright@example.test', 'city', 'Mumbai'),
      jsonb_build_object('business_name', 'Smile Dental Andheri', 'email', 'smile@example.test', 'city', 'Andheri West'),
      jsonb_build_object('business_name', '', 'email', 'bad-address')
    ),
    p_source => 'csv_import'
  );
  perform test.sa_assert(
    'import counts created, duplicate and failed rows',
    (v_batch->>'total')::int = 3
      and (v_batch->>'created')::int = 1
      and (v_batch->>'skipped_duplicate')::int = 1
      and (v_batch->>'failed')::int = 1,
    v_batch::text
  );
  select p.id into v_imported from public.prospects p where p.tenant_id = v_a and p.business_name = 'Bright Smile Clinic';
  perform test.sa_assert('imported prospect exists in the tenant', v_imported is not null, coalesce(v_imported::text, 'null'));

  -- 7. Dashboard metrics are real counts over real tables.
  v_metrics := public.sales_dashboard_metrics(v_a);
  perform test.sa_assert(
    'metrics count real rows and report genuine zero sends',
    (v_metrics->>'total_prospects')::int = 2
      and (v_metrics->>'new_prospects')::int = 1
      and (v_metrics->>'saved_searches')::int = 1
      and (v_metrics->>'verified_contacts')::int = 0
      and (v_metrics->>'active_campaigns')::int = 0
      and (v_metrics->>'emails_sent')::int = 0
      and (v_metrics->>'replies_received')::int = 0
      and (v_metrics->>'interested_prospects')::int = 0
      and (v_metrics->>'converted_customers')::int = 0,
    v_metrics::text
  );

  -- 8. Suppression is tenant-scoped, case-insensitive and trimmed.
  perform test.add_suppression(v_a, '  OptOut@Example.test ');
  perform test.sa_assert('suppression matches normalized email', public.sales_is_suppressed(v_a, 'optout@example.test'));
  perform test.sa_assert('unknown email is not suppressed', not public.sales_is_suppressed(v_a, 'nobody@example.test'));

  -- 9. Verification evidence: syntax alone can never produce 'verified'.
  perform test.expect_error(format(
    'select test.add_verification(%L, %L, %L, %L, null)', v_a, v_prospect, 'verified', 'manual'
  ));
  perform test.sa_assert('unverified manual attestation is rejected', true);
  perform test.add_verification(v_a, v_prospect, 'verified', 'manual', v_owner_a);
  perform test.sa_assert('verified with a human attestor is allowed', true);

  -- 10. Cross-tenant isolation.
  perform test.act_as(v_owner_b, 'sa-owner-b@example.test');
  perform test.sa_assert(
    'other tenant cannot read prospects',
    not exists (select 1 from public.prospects where tenant_id = v_a),
    v_b::text
  );
  perform test.sa_assert('other tenant metrics are empty', public.sales_dashboard_metrics(v_a) = '{}'::jsonb);
  perform test.sa_assert(
    'cross-tenant duplicate lookup returns null',
    public.sales_find_duplicate_prospect(p_tenant => v_a, p_email => 'x@example.test') is null
  );
  perform test.expect_error(format(
    'select public.sales_create_prospect(p_tenant => %L, p_business_name => %L)', v_a, 'Intruder Clinic'
  ));
  perform test.sa_assert('cross-tenant create is rejected', true);
  perform test.expect_error(format(
    'insert into public.prospects (tenant_id, business_name) values (%L, %L)', v_a, 'Direct insert'
  ));
  perform test.sa_assert('direct client insert is rejected', true);

  -- 10b. Prospect -> CRM contact conversion is tenant-scoped and idempotent.
  perform test.act_as(v_owner_a, 'sa-owner-a@example.test');
  v_contact := public.sales_convert_prospect_to_contact(v_a, v_imported);
  perform test.sa_assert('conversion creates a real CRM contact', v_contact is not null, coalesce(v_contact::text, 'null'));
  perform test.sa_assert(
    'contact carries prospect company and sales_agent source',
    exists (
      select 1 from public.contacts c
      where c.id = v_contact and c.tenant_id = v_a
        and c.company = 'Bright Smile Clinic' and c.source = 'sales_agent'
    ),
    coalesce(v_contact::text, 'null')
  );
  perform test.sa_assert(
    'prospect is marked converted and linked to the contact',
    exists (
      select 1 from public.prospects p
      where p.id = v_imported and p.lead_status = 'converted'
        and p.converted_contact_id = v_contact and p.converted_at is not null
    )
  );
  perform test.sa_assert(
    'second conversion is idempotent',
    public.sales_convert_prospect_to_contact(v_a, v_imported) = v_contact
  );
  perform test.act_as(v_owner_b, 'sa-owner-b@example.test');
  perform test.expect_error(format(
    'select public.sales_convert_prospect_to_contact(%L, %L)', v_a, v_imported
  ));
  perform test.sa_assert('cross-tenant conversion is rejected', true);

  -- 11. Owner can delete in their own tenant.
  perform test.act_as(v_owner_a, 'sa-owner-a@example.test');
  perform public.sales_delete_prospect(v_a, v_prospect);
  perform test.sa_assert(
    'owner deletes a prospect',
    not exists (select 1 from public.prospects where id = v_prospect and tenant_id = v_a)
  );
end $$;

select test_name, passed, detail from test.sa_results order by id;
select count(*) as checks_passed from test.sa_results where passed;

rollback;
