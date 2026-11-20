-- ============================================================================
-- contact_import_export.sql
-- Milestone 2 import/export workflow, validation, idempotency, permissions and
-- cross-tenant security checks.
--
-- Run against a local Supabase database:
--   psql "$DATABASE_URL" -f supabase/tests/contact_import_export.sql
--
-- In the hosted Supabase SQL Editor, remove the psql-only \set line first.
-- The whole file is one transaction and is always rolled back.
-- A passing run reports 33/33 checks.
-- ============================================================================
\set ON_ERROR_STOP on

begin;

create schema if not exists test;

create table test.imp_results (
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

create or replace function test.imp_assert(p_name text, p_ok boolean, p_detail text default '')
returns void
language plpgsql
as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FAIL: % (%)', p_name, p_detail;
  end if;
  insert into test.imp_results (test_name, passed, detail) values (p_name, true, p_detail);
end;
$$;

grant usage on schema test to authenticated;
grant select, insert on test.imp_results to authenticated;
grant execute on all functions in schema test to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures: two isolated tenants; one manager and one employee in tenant A
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'imp-owner-a@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Import Owner A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'imp-owner-b@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Import Owner B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b3000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'imp-manager-a@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Import Manager A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b4000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'imp-employee-a@example.test', crypt('test-password', gen_salt('bf')), now(), '{"full_name":"Import Employee A"}', now(), now());

select test.act_as('b1000000-0000-4000-8000-000000000001', 'imp-owner-a@example.test');
select public.create_business('Import Alpha Clinic', 'imp-alpha-clinic', 'dental-clinic');
select public.apply_industry_template((select id from public.businesses where slug = 'imp-alpha-clinic'), 'dental-clinic');

select test.act_as('b2000000-0000-4000-8000-000000000002', 'imp-owner-b@example.test');
select public.create_business('Import Beta Salon', 'imp-beta-salon', 'salon-spa');

do $$
declare
  v_a uuid;
  v_token text;
begin
  perform test.act_as('b1000000-0000-4000-8000-000000000001', 'imp-owner-a@example.test');
  v_a := (select id from public.businesses where slug = 'imp-alpha-clinic');
  v_token := public.create_business_invitation(v_a, 'imp-manager-a@example.test', 'manager');
  perform set_config('test.imp_manager_token', v_token, true);
  v_token := public.create_business_invitation(v_a, 'imp-employee-a@example.test', 'employee');
  perform set_config('test.imp_employee_token', v_token, true);
end;
$$;

select test.act_as('b3000000-0000-4000-8000-000000000003', 'imp-manager-a@example.test');
select public.accept_business_invitation(current_setting('test.imp_manager_token'));
select test.act_as('b4000000-0000-4000-8000-000000000004', 'imp-employee-a@example.test');
select public.accept_business_invitation(current_setting('test.imp_employee_token'));

-- ---------------------------------------------------------------------------
-- 1. Role restrictions and tenant-derived identity
-- ---------------------------------------------------------------------------
do $$
declare
  v_a uuid;
  v_b uuid;
  v_job uuid;
  v_visible integer;
begin
  perform test.act_as('b1000000-0000-4000-8000-000000000001', 'imp-owner-a@example.test');
  v_a := (select id from public.businesses where slug = 'imp-alpha-clinic');
  perform test.act_as('b2000000-0000-4000-8000-000000000002', 'imp-owner-b@example.test');
  v_b := (select id from public.businesses where slug = 'imp-beta-salon');
  perform test.act_as('b4000000-0000-4000-8000-000000000004', 'imp-employee-a@example.test');
  perform test.expect_error(format(
    'select public.crm_start_import(%L, ''contacts'', ''x.csv'', 10, ''employee-hash-01'', ''skip'', 1)', v_a
  ));
  perform test.imp_assert('employees cannot start imports', true);

  select count(*) into v_visible
  from public.contact_import_jobs j where j.tenant_id = v_a;
  perform test.imp_assert('employees cannot read import history', v_visible = 0, v_visible::text);

  perform test.expect_error(format(
    'insert into public.contact_import_jobs (tenant_id, kind, file_name, file_size, file_hash, duplicate_mode) values (%L, ''contacts'', ''x.csv'', 10, ''direct-insert-01'', ''skip'')', v_a
  ));
  perform test.imp_assert('RLS blocks direct job inserts by employees', true);

  perform test.act_as('b3000000-0000-4000-8000-000000000003', 'imp-manager-a@example.test');
  perform test.expect_error(format(
    'select public.crm_start_import(%L, ''contacts'', ''x.csv'', 10, ''cross-tenant-hash'', ''skip'', 1)', v_b
  ));
  perform test.imp_assert('manager cannot start an import for another tenant', true);

  perform test.expect_error(format(
    'select public.crm_start_import(%L, ''contacts'', ''x.csv'', 6000000, ''big-file-hash'', ''skip'', 1)', v_a
  ));
  perform test.expect_error(format(
    'select public.crm_start_import(%L, ''contacts'', ''x.csv'', 10, ''short'', ''skip'', 1)', v_a
  ));
  perform test.expect_error(format(
    'select public.crm_start_import(%L, ''contacts'', ''x.csv'', 10, ''too-many-rows-hash'', ''skip'', 5001)', v_a
  ));
  perform test.expect_error(format(
    'select public.crm_start_import(%L, ''contacts'', ''x.csv'', 10, ''bad-mode-hash'', ''delete'', 1)', v_a
  ));
  perform test.imp_assert('server validates file size, hash, row count and duplicate mode', true);

  v_job := public.crm_start_import(v_a, 'contacts', 'rows.csv', 120, 'imp-hash-batch-01', 'skip', 3);
  perform test.imp_assert('manager can start a valid import', v_job is not null, v_job::text);
  perform test.imp_assert(
    're-uploading an open file returns the same job',
    public.crm_start_import(v_a, 'contacts', 'rows.csv', 120, 'imp-hash-batch-01', 'skip', 3) = v_job
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Duplicate detection reads only the caller's tenant
-- ---------------------------------------------------------------------------
do $$
declare
  v_a uuid;
  v_b uuid;
  v_existing uuid;
  v_matches jsonb;
  v_tag uuid;
begin
  perform test.act_as('b1000000-0000-4000-8000-000000000001', 'imp-owner-a@example.test');
  v_a := (select id from public.businesses where slug = 'imp-alpha-clinic');
  perform test.act_as('b2000000-0000-4000-8000-000000000002', 'imp-owner-b@example.test');
  v_b := (select id from public.businesses where slug = 'imp-beta-salon');
  perform test.act_as('b3000000-0000-4000-8000-000000000003', 'imp-manager-a@example.test');
  v_existing := public.create_contact(v_a, 'Existing', 'Contact', 'dup@example.test', '9876500002', null, null, null, null, null, 'new');
  insert into public.tags (tenant_id, name, color) values (v_a, 'VIP', '#f59e0b') returning id into v_tag;
  perform set_config('test.imp_tag_id', v_tag::text, true);

  v_matches := public.crm_check_import_duplicates(v_a, jsonb_build_array(
    jsonb_build_object('rowNumber', '1', 'first_name', 'New', 'email', 'dup@example.test'),
    jsonb_build_object('rowNumber', '2', 'first_name', 'New', 'phone', '+91 98765 00002')
  ));
  perform test.imp_assert('duplicate preview finds email and phone matches', jsonb_array_length(v_matches) = 2, v_matches::text);
  perform test.imp_assert(
    'duplicate matches expose the existing contact id',
    v_matches -> 0 ->> 'contactId' = v_existing::text
  );

  perform test.act_as('b2000000-0000-4000-8000-000000000002', 'imp-owner-b@example.test');
  perform test.expect_error(format(
    'select public.crm_check_import_duplicates(%L, ''[]''::jsonb)', v_a
  ));
  perform test.imp_assert('cross-tenant duplicate preview is denied', true);
  perform test.imp_assert(
    'cross-tenant export returns no rows',
    (select count(*) from public.crm_export_rows(v_a, 'contacts')) = 0
  );
  perform test.imp_assert(
    'own-tenant export still works for the other tenant',
    (select count(*) from public.crm_export_rows(v_b, 'contacts')) = 0
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Batch processing: validation, duplicate modes, idempotency
-- ---------------------------------------------------------------------------
do $$
declare
  v_a uuid;
  v_job uuid;
  v_rows jsonb := jsonb_build_array(
    jsonb_build_object('rowNumber', '1', 'first_name', 'Imported', 'last_name', 'One', 'email', 'import1@example.test', 'phone', '9876500001', 'status', 'lead', 'lead_status', 'new'),
    jsonb_build_object('rowNumber', '2', 'first_name', 'Invalid', 'email', 'not-an-email'),
    jsonb_build_object('rowNumber', '3', 'first_name', 'Duplicate', 'email', 'dup@example.test')
  );
  v_batch jsonb;
  v_replay jsonb;
  v_before integer;
  v_after integer;
  v_tag_ids jsonb;
  v_tagged_count integer;
begin
  perform test.act_as('b1000000-0000-4000-8000-000000000001', 'imp-owner-a@example.test');
  v_a := (select id from public.businesses where slug = 'imp-alpha-clinic');
  perform test.act_as('b3000000-0000-4000-8000-000000000003', 'imp-manager-a@example.test');
  v_job := (select id from public.contact_import_jobs where tenant_id = v_a and file_hash = 'imp-hash-batch-01');
  v_tag_ids := jsonb_build_array(current_setting('test.imp_tag_id')::uuid);
  v_rows := jsonb_set(v_rows, '{0,tag_ids}', v_tag_ids);
  select count(*) into v_before from public.contacts where tenant_id = v_a;

  v_batch := public.crm_process_import_batch(v_job, 0, v_rows);
  perform test.imp_assert('batch reports created/failed/skipped', v_batch ->> 'created' = '1' and v_batch ->> 'failed' = '1' and v_batch ->> 'skipped' = '1', v_batch::text);
  perform test.imp_assert('invalid email row is rejected by the server', v_batch -> 'results' -> 1 ->> 'status' = 'failed', v_batch::text);
  perform test.imp_assert('duplicate row is skipped', v_batch -> 'results' -> 2 ->> 'status' = 'skipped', v_batch::text);

  select count(*) into v_after from public.contacts where tenant_id = v_a;
  perform test.imp_assert('only the valid row was inserted', v_after = v_before + 1, format('%s -> %s', v_before, v_after));
  select count(*) into v_tagged_count
  from public.contact_tags ct
  where ct.tenant_id = v_a and ct.tag_id = current_setting('test.imp_tag_id')::uuid;
  perform test.imp_assert('tagged rows attach tags via text-to-uuid cast', v_tagged_count = 1, v_tagged_count::text);

  v_replay := public.crm_process_import_batch(v_job, 0, v_rows);
  perform test.imp_assert('replayed batch is detected', v_replay ->> 'replayed' = 'true', v_replay::text);
  select count(*) into v_after from public.contacts where tenant_id = v_a;
  perform test.imp_assert('replayed batch writes nothing', v_after = v_before + 1, v_after::text);

  perform test.expect_error(format('select public.crm_process_import_batch(%L, -1, ''[]''::jsonb)', v_job));
  perform test.expect_error(format('select public.crm_process_import_batch(%L, 1, ''[]''::jsonb)', v_job));
  perform test.imp_assert('batch index and empty batches are rejected', true);

  perform public.crm_complete_import(v_job);
  perform test.expect_error(format('select public.crm_process_import_batch(%L, 2, ''[]''::jsonb)', v_job));
  perform test.imp_assert('closed job cannot process more batches', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Update mode and explicit confirmation for import-as-new
-- ---------------------------------------------------------------------------
do $$
declare
  v_a uuid;
  v_job uuid;
  v_result jsonb;
  v_company text;
  v_new_job uuid;
begin
  perform test.act_as('b1000000-0000-4000-8000-000000000001', 'imp-owner-a@example.test');
  v_a := (select id from public.businesses where slug = 'imp-alpha-clinic');
  perform test.act_as('b3000000-0000-4000-8000-000000000003', 'imp-manager-a@example.test');

  v_job := public.crm_start_import(v_a, 'contacts', 'update.csv', 80, 'imp-hash-update-01', 'update', 1);
  v_result := public.crm_process_import_batch(v_job, 0, jsonb_build_array(
    jsonb_build_object('rowNumber', '1', 'first_name', 'Existing', 'email', 'dup@example.test', 'company', 'Updated Clinic')
  ));
  perform test.imp_assert('update mode updates the matching contact', v_result ->> 'updated' = '1', v_result::text);
  select c.company into v_company from public.contacts c where c.tenant_id = v_a and c.email = 'dup@example.test';
  perform test.imp_assert('updated values are persisted', v_company = 'Updated Clinic', coalesce(v_company, 'null'));

  v_new_job := public.crm_start_import(v_a, 'contacts', 'new.csv', 80, 'imp-hash-new-01', 'new', 2);
  v_result := public.crm_process_import_batch(v_new_job, 0, jsonb_build_array(
    jsonb_build_object('rowNumber', '1', 'first_name', 'No Confirm', 'email', 'dup@example.test')
  ));
  perform test.imp_assert('duplicates are not created before confirmation', v_result ->> 'skipped' = '1', v_result::text);

  perform public.crm_confirm_import_duplicates(v_new_job);
  v_result := public.crm_process_import_batch(v_new_job, 1, jsonb_build_array(
    jsonb_build_object('rowNumber', '2', 'first_name', 'Confirmed New', 'email', 'dup@example.test')
  ));
  perform test.imp_assert('explicit confirmation allows import-as-new', v_result ->> 'created' = '1', v_result::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Export respects per-record visibility and tenant isolation
-- ---------------------------------------------------------------------------
do $$
declare
  v_a uuid;
  v_manager uuid := 'b3000000-0000-4000-8000-000000000003';
begin
  perform test.act_as('b1000000-0000-4000-8000-000000000001', 'imp-owner-a@example.test');
  v_a := (select id from public.businesses where slug = 'imp-alpha-clinic');
  perform test.act_as('b3000000-0000-4000-8000-000000000003', 'imp-manager-a@example.test');
  perform public.create_contact(v_a, 'Private', 'Record', 'private@example.test', null, null, null, null, null, v_manager, 'new');

  perform test.imp_assert(
    'manager export includes visible contacts',
    exists (select 1 from public.crm_export_rows(v_a, 'contacts') where email = 'import1@example.test')
  );
  perform test.imp_assert(
    'filtered lead export excludes customers',
    (select count(*) from public.crm_export_rows(v_a, 'leads') where status <> 'lead') = 0
  );
  perform test.imp_assert(
    'query filter is applied server-side',
    (select count(*) from public.crm_export_rows(v_a, 'contacts', 'Imported')) = 1
  );

  perform test.act_as('b4000000-0000-4000-8000-000000000004', 'imp-employee-a@example.test');
  perform test.imp_assert(
    'employee export excludes records owned by someone else',
    not exists (select 1 from public.crm_export_rows(v_a, 'contacts') where email = 'private@example.test')
  );
  perform test.imp_assert(
    'employee export still includes visible unassigned records',
    exists (select 1 from public.crm_export_rows(v_a, 'contacts') where email = 'import1@example.test')
  );
  perform test.expect_error(format('select public.crm_start_import(%L, ''leads'', ''x.csv'', 10, ''employee-leads-hash'', ''skip'', 1)', v_a));
  perform test.imp_assert('employees cannot import leads either', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Import activity is audited
-- ---------------------------------------------------------------------------
do $$
declare
  v_a uuid;
  v_started integer;
  v_completed integer;
begin
  perform test.act_as('b1000000-0000-4000-8000-000000000001', 'imp-owner-a@example.test');
  v_a := (select id from public.businesses where slug = 'imp-alpha-clinic');
  select count(*) into v_started
  from public.audit_logs l where l.tenant_id = v_a and l.action = 'contact_import.started';
  select count(*) into v_completed
  from public.audit_logs l where l.tenant_id = v_a and l.action = 'contact_import.completed';
  perform test.imp_assert('import start is audited', v_started >= 3, v_started::text);
  perform test.imp_assert('import completion is audited', v_completed >= 1, v_completed::text);
end;
$$;

select
  count(*) as total_checks,
  count(*) filter (where passed) as passed_checks,
  count(*) filter (where not passed) as failed_checks
from test.imp_results;

rollback;
