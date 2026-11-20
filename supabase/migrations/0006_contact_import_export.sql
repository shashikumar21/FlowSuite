-- Milestone 2 addition: secure contact/lead import and export.
--
-- Design rules:
-- * Tenant identity ALWAYS comes from the caller's authenticated membership.
--   No tenant id is ever read from an uploaded row.
-- * Data-touching RPCs are SECURITY INVOKER, so RLS remains authoritative for
--   contacts, contact_tags and the import tables. Only the small audit helpers
--   are SECURITY DEFINER (audit_logs is deliberately not writable by clients).
-- * Every row is validated again on the server, even when the browser preview
--   already validated it.
-- * Batches are idempotent: replaying a batch returns its stored result instead
--   of writing a second time. Re-uploading the same file returns the same job.
--
begin;

-- ---------------------------------------------------------------------------
-- 1. Import jobs and batches
-- ---------------------------------------------------------------------------

create table public.contact_import_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('contacts', 'leads')),
  file_name text not null,
  file_size integer not null default 0 check (file_size >= 0),
  file_hash text not null,
  duplicate_mode text not null check (duplicate_mode in ('skip', 'update', 'new')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  total_rows integer not null default 0 check (total_rows >= 0),
  processed_rows integer not null default 0 check (processed_rows >= 0),
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  confirmed_new_duplicates boolean not null default false,
  error_report jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint contact_import_jobs_file_unique unique (tenant_id, file_hash, kind)
);

create table public.contact_import_batches (
  job_id uuid not null references public.contact_import_jobs(id) on delete cascade,
  batch_index integer not null check (batch_index >= 0),
  row_count integer not null default 0,
  results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (job_id, batch_index)
);

create index contact_import_jobs_tenant_idx
  on public.contact_import_jobs(tenant_id, created_at desc);
create index contact_import_batches_job_idx
  on public.contact_import_batches(job_id, batch_index);

-- ---------------------------------------------------------------------------
-- 2. RLS and grants. Import history is manager-only, never cross-tenant.
-- ---------------------------------------------------------------------------

alter table public.contact_import_jobs enable row level security;
alter table public.contact_import_batches enable row level security;

create policy "CRM: read import jobs" on public.contact_import_jobs
  for select to authenticated
  using (public.has_tenant_access(tenant_id) and public.can_manage_crm(tenant_id));

create policy "CRM: create import jobs" on public.contact_import_jobs
  for insert to authenticated
  with check (public.has_tenant_access(tenant_id) and public.can_manage_crm(tenant_id));

create policy "CRM: update import jobs" on public.contact_import_jobs
  for update to authenticated
  using (public.has_tenant_access(tenant_id) and public.can_manage_crm(tenant_id))
  with check (public.has_tenant_access(tenant_id) and public.can_manage_crm(tenant_id));

create policy "CRM: read import batches" on public.contact_import_batches
  for select to authenticated
  using (
    exists (
      select 1 from public.contact_import_jobs j
      where j.id = job_id
        and public.has_tenant_access(j.tenant_id)
        and public.can_manage_crm(j.tenant_id)
    )
  );

create policy "CRM: create import batches" on public.contact_import_batches
  for insert to authenticated
  with check (
    exists (
      select 1 from public.contact_import_jobs j
      where j.id = job_id
        and public.has_tenant_access(j.tenant_id)
        and public.can_manage_crm(j.tenant_id)
    )
  );

revoke all on public.contact_import_jobs, public.contact_import_batches from anon;
grant select, insert, update on public.contact_import_jobs to authenticated;
grant select, insert on public.contact_import_batches to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Audit helpers (SECURITY DEFINER only because audit_logs is insert-denied
--    to clients). They re-check the caller's membership and role.
-- ---------------------------------------------------------------------------

create or replace function public.crm_start_import(
  p_tenant uuid,
  p_kind text,
  p_file_name text,
  p_file_size integer,
  p_file_hash text,
  p_duplicate_mode text,
  p_total_rows integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_existing uuid;
  v_job uuid;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;
  if not public.has_tenant_access(p_tenant) then
    raise exception 'No access to this business';
  end if;
  if not public.can_manage_crm(p_tenant) then
    raise exception 'Only managers can import records';
  end if;
  if p_kind not in ('contacts', 'leads') then
    raise exception 'Invalid import type';
  end if;
  if p_duplicate_mode not in ('skip', 'update', 'new') then
    raise exception 'Invalid duplicate handling option';
  end if;
  if coalesce(btrim(p_file_name), '') = '' or length(p_file_name) > 255 then
    raise exception 'Invalid file name';
  end if;
  if p_file_size < 1 or p_file_size > 5242880 then
    raise exception 'File must be between 1 byte and 5 MB';
  end if;
  if p_file_hash is null or length(p_file_hash) < 8 or length(p_file_hash) > 64 then
    raise exception 'Invalid file signature';
  end if;
  if p_total_rows < 1 or p_total_rows > 5000 then
    raise exception 'Import must contain between 1 and 5000 rows';
  end if;

  select j.id into v_existing
  from public.contact_import_jobs j
  where j.tenant_id = p_tenant
    and j.file_hash = p_file_hash
    and j.kind = p_kind;
  if found then
    return v_existing;
  end if;

  insert into public.contact_import_jobs (
    tenant_id, created_by, kind, file_name, file_size, file_hash,
    duplicate_mode, total_rows
  ) values (
    p_tenant, v_caller, p_kind, btrim(p_file_name), p_file_size, p_file_hash,
    p_duplicate_mode, p_total_rows
  ) returning id into v_job;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_caller, 'contact_import.started', 'contact_import', v_job::text,
    jsonb_build_object(
      'kind', p_kind,
      'file_name', btrim(p_file_name),
      'rows', p_total_rows,
      'duplicate_mode', p_duplicate_mode
    )
  );

  return v_job;
end;
$$;

create or replace function public.crm_complete_import(
  p_job_id uuid,
  p_failed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_job public.contact_import_jobs%rowtype;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_job from public.contact_import_jobs j where j.id = p_job_id;
  if not found then
    raise exception 'Import job not found';
  end if;
  if not public.can_manage_crm(v_job.tenant_id) then
    raise exception 'No access to this import';
  end if;

  update public.contact_import_jobs j
  set status = case when p_failed then 'failed' else 'completed' end,
      completed_at = now()
  where j.id = p_job_id and j.status in ('pending', 'processing');

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    v_job.tenant_id, v_caller,
    case when p_failed then 'contact_import.failed' else 'contact_import.completed' end,
    'contact_import', p_job_id::text,
    jsonb_build_object(
      'kind', v_job.kind,
      'file_name', v_job.file_name,
      'created', v_job.created_count,
      'updated', v_job.updated_count,
      'skipped', v_job.skipped_count,
      'failed', v_job.failed_count
    )
  );

  return jsonb_build_object(
    'id', v_job.id,
    'status', case when p_failed then 'failed' else 'completed' end,
    'total_rows', v_job.total_rows,
    'processed_rows', v_job.processed_rows,
    'created', v_job.created_count,
    'updated', v_job.updated_count,
    'skipped', v_job.skipped_count,
    'failed', v_job.failed_count
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Duplicate preview (read-only, RLS applies to contacts)
-- ---------------------------------------------------------------------------

create or replace function public.crm_check_import_duplicates(
  p_tenant uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_count integer;
  v_index integer;
  v_row jsonb;
  v_email text;
  v_phone text;
  v_dup_id uuid;
  v_dup_name text;
  v_match text;
  v_results jsonb := '[]'::jsonb;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;
  if not public.has_tenant_access(p_tenant) then
    raise exception 'No access to this business';
  end if;
  if not public.can_manage_crm(p_tenant) then
    raise exception 'Only managers can import records';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows must be an array';
  end if;
  v_count := jsonb_array_length(p_rows);
  if v_count > 5000 then
    raise exception 'Too many rows';
  end if;

  for v_index in 0 .. v_count - 1 loop
    v_row := p_rows -> v_index;
    v_email := lower(btrim(coalesce(v_row ->> 'email', '')));
    v_phone := regexp_replace(coalesce(v_row ->> 'phone', ''), '\D', '', 'g');
    v_phone := ltrim(v_phone, '0');
    if length(v_phone) = 12 and left(v_phone, 2) = '91' then
      v_phone := substring(v_phone from 3);
    end if;
    v_dup_id := null;
    v_match := null;

    if v_email <> '' then
      select c.id, c.first_name || ' ' || coalesce(c.last_name, '')
        into v_dup_id, v_dup_name
      from public.contacts c
      where c.tenant_id = p_tenant
        and public.can_view_contact(p_tenant, c.id)
        and lower(c.email) = v_email
      order by c.created_at
      limit 1;
      if found then v_match := 'email'; end if;
    end if;

    if v_dup_id is null and v_phone <> '' and length(v_phone) >= 7 then
      select c.id, c.first_name || ' ' || coalesce(c.last_name, '')
        into v_dup_id, v_dup_name
      from public.contacts c
      where c.tenant_id = p_tenant
        and public.can_view_contact(p_tenant, c.id)
        and ltrim(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), '0') = v_phone
      order by c.created_at
      limit 1;
      if found then v_match := 'phone'; end if;
    end if;

    if v_dup_id is not null then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'rowNumber', coalesce(v_row ->> 'rowNumber', (v_index + 1)::text),
        'contactId', v_dup_id,
        'name', btrim(v_dup_name),
        'matchType', v_match
      ));
    end if;
  end loop;

  return v_results;
end;
$$;

create or replace function public.crm_confirm_import_duplicates(p_job_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_tenant uuid;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select j.tenant_id into v_tenant
  from public.contact_import_jobs j
  where j.id = p_job_id and j.status in ('pending', 'processing');
  if not found then
    raise exception 'Import job is not open';
  end if;
  if not public.has_tenant_access(v_tenant) or not public.can_manage_crm(v_tenant) then
    raise exception 'No access to this import';
  end if;

  update public.contact_import_jobs j
  set confirmed_new_duplicates = true
  where j.id = p_job_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Batch processing. SECURITY INVOKER: contacts/contact_tags/job writes are
--    all checked by RLS. Tenant identity comes from the job, never the payload.
-- ---------------------------------------------------------------------------

create or replace function public.crm_process_import_batch(
  p_job_id uuid,
  p_batch_index integer,
  p_rows jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_job public.contact_import_jobs%rowtype;
  v_tenant uuid;
  v_mode text;
  v_kind text;
  v_existing jsonb;
  v_count integer;
  v_index integer;
  v_tag_index integer;
  v_row jsonb;
  v_row_number text;
  v_first text;
  v_last text;
  v_email text;
  v_phone text;
  v_company text;
  v_notes text;
  v_lead_status text;
  v_status text;
  v_source_id uuid;
  v_assigned uuid;
  v_source_name text;
  v_custom jsonb;
  v_tag_ids jsonb;
  v_tag_id uuid;
  v_dup_id uuid;
  v_match text;
  v_contact_id uuid;
  v_result text;
  v_message text;
  v_details text[];
  v_detail text;
  v_results jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_created integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_job from public.contact_import_jobs j where j.id = p_job_id;
  if not found then
    raise exception 'Import job not found';
  end if;
  v_tenant := v_job.tenant_id;
  if not public.has_tenant_access(v_tenant) or not public.can_manage_crm(v_tenant) then
    raise exception 'No access to this import';
  end if;
  if v_job.status not in ('pending', 'processing') then
    raise exception 'This import is already closed';
  end if;
  if p_batch_index is null or p_batch_index < 0 then
    raise exception 'Invalid batch index';
  end if;

  -- Idempotency: a replayed batch never writes twice.
  select b.results into v_existing
  from public.contact_import_batches b
  where b.job_id = p_job_id and b.batch_index = p_batch_index;
  if found then
    return jsonb_build_object(
      'results', v_existing,
      'replayed', true,
      'created', v_job.created_count,
      'updated', v_job.updated_count,
      'skipped', v_job.skipped_count,
      'failed', v_job.failed_count
    );
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows must be an array';
  end if;
  v_count := jsonb_array_length(p_rows);
  if v_count < 1 or v_count > 100 then
    raise exception 'A batch must contain between 1 and 100 rows';
  end if;

  v_mode := v_job.duplicate_mode;
  v_kind := v_job.kind;

  for v_index in 0 .. v_count - 1 loop
    v_row := p_rows -> v_index;
    v_row_number := coalesce(v_row ->> 'rowNumber', (v_index + 1)::text);
    v_details := array[]::text[];
    v_result := 'failed';
    v_message := null;

    begin
      v_first := btrim(coalesce(v_row ->> 'first_name', ''));
      v_last := btrim(coalesce(v_row ->> 'last_name', ''));
      v_email := lower(btrim(coalesce(v_row ->> 'email', '')));
      v_phone := regexp_replace(coalesce(v_row ->> 'phone', ''), '\D', '', 'g');
      v_phone := ltrim(v_phone, '0');
      if length(v_phone) = 12 and left(v_phone, 2) = '91' then
        v_phone := substring(v_phone from 3);
      end if;
      v_company := btrim(coalesce(v_row ->> 'company', ''));
      v_notes := btrim(coalesce(v_row ->> 'notes', ''));
      v_lead_status := nullif(btrim(coalesce(v_row ->> 'lead_status', v_row ->> 'leadStatus', '')), '');
      v_status := nullif(btrim(coalesce(v_row ->> 'status', '')), '');
      v_lead_status := coalesce(v_lead_status, 'new');
      v_status := coalesce(v_status, case when v_kind = 'leads' then 'lead' else 'lead' end);
      v_custom := case when jsonb_typeof(v_row -> 'custom_data') = 'object'
                       then v_row -> 'custom_data' else '{}'::jsonb end;
      v_tag_ids := case when jsonb_typeof(v_row -> 'tag_ids') = 'array'
                        then v_row -> 'tag_ids' else '[]'::jsonb end;

      if v_first = '' then v_details := v_details || 'First name is required'; end if;
      if length(v_first) > 100 then v_details := v_details || 'First name is too long'; end if;
      if length(v_last) > 100 then v_details := v_details || 'Last name is too long'; end if;
      if v_email <> '' and (length(v_email) > 255 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
        v_details := v_details || 'Invalid email address';
      end if;
      if v_phone <> '' and (length(v_phone) < 7 or length(v_phone) > 15 or v_phone !~ '^[0-9]+$') then
        v_details := v_details || 'Invalid phone number';
      end if;
      if length(v_company) > 150 then v_details := v_details || 'Company name is too long'; end if;
      if length(v_notes) > 2000 then v_details := v_details || 'Notes are too long'; end if;
      if v_lead_status not in ('new', 'contacted', 'qualified', 'unqualified', 'converted') then
        v_details := v_details || 'Invalid lead status';
      end if;
      if v_status not in ('lead', 'customer', 'inactive') then
        v_details := v_details || 'Invalid contact status';
      end if;
      if v_kind = 'leads' and v_status <> 'lead' then
        v_details := v_details || 'A lead import cannot create a customer';
      end if;

      -- Configuration references must exist in THIS tenant.
      if v_row ? 'source_id' and nullif(btrim(coalesce(v_row ->> 'source_id', '')), '') is not null then
        begin
          v_source_id := (v_row ->> 'source_id')::uuid;
        exception when others then
          v_source_id := null;
          v_details := v_details || 'Invalid lead source';
        end;
        if v_source_id is not null then
          select ls.name into v_source_name
          from public.lead_sources ls
          where ls.id = v_source_id and ls.tenant_id = v_tenant and ls.active;
          if not found then
            v_details := v_details || 'Lead source is not active in this business';
          end if;
        end if;
      else
        v_source_id := null;
        v_source_name := null;
      end if;

      if nullif(btrim(coalesce(v_row ->> 'assigned_to', '')), '') is not null then
        begin
          v_assigned := (v_row ->> 'assigned_to')::uuid;
        exception when others then
          v_assigned := null;
          v_details := v_details || 'Invalid owner';
        end;
        if v_assigned is not null and not public.is_active_member(v_tenant, v_assigned) then
          v_details := v_details || 'Owner is not an active member of this business';
        end if;
      else
        v_assigned := null;
      end if;

      -- Custom field keys must be declared for this tenant and record type.
      if exists (select 1 from jsonb_object_keys(v_custom) as k(key)) then
        if exists (
          select 1
          from jsonb_object_keys(v_custom) as k(key)
          where not exists (
            select 1 from public.custom_fields cf
            where cf.tenant_id = v_tenant
              and cf.key = k.key
              and cf.active
              and cf.entity_type in ('contact', 'lead')
          )
        ) then
          v_details := v_details || 'Unknown custom field';
        end if;
      end if;

      -- Tags must belong to this tenant.
      for v_tag_index in 0 .. jsonb_array_length(v_tag_ids) - 1 loop
        v_tag_id := null;
        begin
          v_tag_id := (v_tag_ids ->> v_tag_index)::uuid;
        exception when others then
          v_details := v_details || 'Invalid tag';
        end;
        if v_tag_id is not null and not exists (
          select 1 from public.tags t where t.id = v_tag_id and t.tenant_id = v_tenant
        ) then
          v_details := v_details || 'Tag does not belong to this business';
        end if;
      end loop;

      if coalesce(array_length(v_details, 1), 0) > 0 then
        v_result := 'failed';
        v_message := array_to_string(v_details, '; ');
      else
        -- Authoritative duplicate check, scoped to the job's tenant.
        v_dup_id := null;
        v_match := null;
        if v_email <> '' then
          select c.id into v_dup_id
          from public.contacts c
          where c.tenant_id = v_tenant
            and public.can_view_contact(v_tenant, c.id)
            and lower(c.email) = v_email
          order by c.created_at
          limit 1;
          if found then v_match := 'email'; end if;
        end if;
        if v_dup_id is null and v_phone <> '' and length(v_phone) >= 7 then
          select c.id into v_dup_id
          from public.contacts c
          where c.tenant_id = v_tenant
            and public.can_view_contact(v_tenant, c.id)
            and ltrim(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), '0') = v_phone
          order by c.created_at
          limit 1;
          if found then v_match := 'phone'; end if;
        end if;

        if v_dup_id is not null and v_mode = 'skip' then
          v_result := 'skipped';
          v_message := 'Possible duplicate (' || v_match || ')';
        elsif v_dup_id is not null and v_mode = 'new' and not v_job.confirmed_new_duplicates then
          v_result := 'skipped';
          v_message := 'Duplicate import was not confirmed';
        elsif v_dup_id is not null and v_mode = 'update' then
          update public.contacts c
          set first_name = v_first,
              last_name = nullif(v_last, ''),
              email = nullif(v_email, ''),
              phone = case when v_phone <> '' then v_phone else c.phone end,
              company = nullif(v_company, ''),
              notes = case when v_notes <> '' then v_notes else c.notes end,
              lead_status = v_lead_status,
              status = v_status,
              custom_data = v_custom
          where c.tenant_id = v_tenant and c.id = v_dup_id;
          v_contact_id := v_dup_id;
          v_result := 'updated';
        else
          insert into public.contacts (
            tenant_id, first_name, last_name, email, phone, company, source,
            source_id, notes, status, lead_status, assigned_to, custom_data
          ) values (
            v_tenant, v_first, nullif(v_last, ''), nullif(v_email, ''),
            nullif(v_phone, ''), nullif(v_company, ''), v_source_name,
            v_source_id, nullif(v_notes, ''), v_status, v_lead_status,
            v_assigned, v_custom
          ) returning id into v_contact_id;
          v_result := 'created';
        end if;

        if v_result in ('created', 'updated') then
          for v_tag_index in 0 .. jsonb_array_length(v_tag_ids) - 1 loop
            v_tag_id := (v_tag_ids ->> v_tag_index)::uuid;
            insert into public.contact_tags (tenant_id, contact_id, tag_id)
            values (v_tenant, v_contact_id, v_tag_id)
            on conflict (tenant_id, contact_id, tag_id) do nothing;
          end loop;
        end if;
      end if;
    exception when others then
      v_result := 'failed';
      -- Never expose raw database errors to the browser.
      v_message := 'Could not import this row (' || sqlstate || ')';
      if sqlerrm like '%duplicate key%' then
        v_result := 'skipped';
        v_message := 'Possible duplicate (unique constraint)';
      end if;
    end;

    if v_result = 'created' then v_created := v_created + 1; end if;
    if v_result = 'updated' then v_updated := v_updated + 1; end if;
    if v_result = 'skipped' then v_skipped := v_skipped + 1; end if;
    if v_result = 'failed' then v_failed := v_failed + 1; end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'rowNumber', v_row_number,
      'status', v_result,
      'message', v_message,
      'name', v_first || ' ' || v_last
    ));
    if v_result in ('failed', 'skipped') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'rowNumber', v_row_number,
        'status', v_result,
        'message', coalesce(v_message, ''),
        'name', v_first || ' ' || v_last
      ));
    end if;
  end loop;

  update public.contact_import_jobs j
  set status = 'processing',
      started_at = coalesce(j.started_at, now()),
      processed_rows = j.processed_rows + v_count,
      created_count = j.created_count + v_created,
      updated_count = j.updated_count + v_updated,
      skipped_count = j.skipped_count + v_skipped,
      failed_count = j.failed_count + v_failed,
      error_report = j.error_report || v_errors
  where j.id = p_job_id;

  insert into public.contact_import_batches (job_id, batch_index, row_count, results)
  values (p_job_id, p_batch_index, v_count, v_results);

  return jsonb_build_object(
    'results', v_results,
    'replayed', false,
    'created', v_created,
    'updated', v_updated,
    'skipped', v_skipped,
    'failed', v_failed
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Export. Read-only and SECURITY INVOKER: the same can_view_contact predicate
--    used by the Contacts screen decides which rows can leave the tenant.
-- ---------------------------------------------------------------------------

create or replace function public.crm_export_rows(
  p_tenant uuid,
  p_kind text,
  p_query text default null,
  p_status text default null,
  p_lead_status text default null,
  p_source_id uuid default null,
  p_assigned_to uuid default null,
  p_tag_id uuid default null,
  p_limit integer default 5000
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  company text,
  status text,
  lead_status text,
  source_name text,
  owner_name text,
  tags text,
  notes text,
  custom_data jsonb,
  created_at timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 5000), 1), 5000);
  v_query text := nullif(trim(coalesce(p_query, '')), '');
begin
  if (select auth.uid()) is null then
    return;
  end if;
  if not public.has_tenant_access(p_tenant) then
    return;
  end if;
  if p_kind not in ('contacts', 'leads') then
    return;
  end if;

  return query
  select
    c.id,
    c.first_name,
    coalesce(c.last_name, ''),
    coalesce(c.email, ''),
    coalesce(c.phone, ''),
    coalesce(c.company, ''),
    c.status,
    c.lead_status,
    coalesce((select ls.name from public.lead_sources ls
              where ls.id = c.source_id and ls.tenant_id = c.tenant_id), ''),
    coalesce((select pr.full_name from public.profiles pr
              where pr.id = c.assigned_to), ''),
    coalesce((
      select string_agg(t.name, ', ' order by t.name)
      from public.contact_tags ct
      join public.tags t on t.id = ct.tag_id and t.tenant_id = ct.tenant_id
      where ct.tenant_id = c.tenant_id and ct.contact_id = c.id
    ), ''),
    coalesce(c.notes, ''),
    c.custom_data,
    c.created_at
  from public.contacts c
  where c.tenant_id = p_tenant
    and public.can_view_contact(p_tenant, c.id)
    and (p_kind <> 'leads' or c.status = 'lead')
    and (v_query is null
         or c.first_name ilike '%' || v_query || '%'
         or coalesce(c.last_name, '') ilike '%' || v_query || '%'
         or coalesce(c.email, '') ilike '%' || v_query || '%'
         or coalesce(c.phone, '') ilike '%' || v_query || '%'
         or coalesce(c.company, '') ilike '%' || v_query || '%')
    and (p_status is null or c.status = p_status)
    and (p_lead_status is null or c.lead_status = p_lead_status)
    and (p_source_id is null or c.source_id = p_source_id)
    and (p_assigned_to is null or c.assigned_to = p_assigned_to)
    and (p_tag_id is null or exists (
      select 1 from public.contact_tags ct
      where ct.tenant_id = c.tenant_id and ct.contact_id = c.id and ct.tag_id = p_tag_id
    ))
  order by c.created_at desc
  limit v_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Privileges. Every new function is revoked from public, then granted only
--    to authenticated users; the DB re-checks role and tenant at call time.
-- ---------------------------------------------------------------------------

revoke all on function public.crm_start_import(uuid, text, text, integer, text, text, integer) from public;
revoke all on function public.crm_complete_import(uuid, boolean) from public;
revoke all on function public.crm_check_import_duplicates(uuid, jsonb) from public;
revoke all on function public.crm_confirm_import_duplicates(uuid) from public;
revoke all on function public.crm_process_import_batch(uuid, integer, jsonb) from public;
revoke all on function public.crm_export_rows(
  uuid, text, text, text, text, uuid, uuid, uuid, integer
) from public;

grant execute on function public.crm_start_import(uuid, text, text, integer, text, text, integer) to authenticated;
grant execute on function public.crm_complete_import(uuid, boolean) to authenticated;
grant execute on function public.crm_check_import_duplicates(uuid, jsonb) to authenticated;
grant execute on function public.crm_confirm_import_duplicates(uuid) to authenticated;
grant execute on function public.crm_process_import_batch(uuid, integer, jsonb) to authenticated;
grant execute on function public.crm_export_rows(
  uuid, text, text, text, text, uuid, uuid, uuid, integer
) to authenticated;

commit;
