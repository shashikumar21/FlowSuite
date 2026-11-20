-- Follow-up to 0006/0007: allow an explicitly confirmed "import as new" to
-- create records with an email or phone that already exists. Normal CRM writes
-- keep the original unique guarantees: only rows created by an import job with
-- confirmed_new_duplicates = true and duplicate_mode = 'new' are flagged.
--
begin;

alter table public.contacts
  add column if not exists import_allow_duplicate boolean not null default false;

drop index if exists public.contacts_tenant_email_key;
create unique index contacts_tenant_email_key
  on public.contacts (tenant_id, lower(email))
  where email is not null and lower(email) <> '' and not import_allow_duplicate;

drop index if exists public.contacts_tenant_phone_key;
create unique index contacts_tenant_phone_key
  on public.contacts (tenant_id, regexp_replace(phone, '\D', '', 'g'))
  where phone is not null and regexp_replace(phone, '\D', '', 'g') <> '' and not import_allow_duplicate;
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
            source_id, notes, status, lead_status, assigned_to, custom_data,
            import_allow_duplicate
          ) values (
            v_tenant, v_first, nullif(v_last, ''), nullif(v_email, ''),
            nullif(v_phone, ''), nullif(v_company, ''), v_source_name,
            v_source_id, nullif(v_notes, ''), v_status, v_lead_status,
            v_assigned, v_custom,
            (v_mode = 'new' and v_job.confirmed_new_duplicates)
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
revoke all on function public.crm_process_import_batch(uuid, integer, jsonb) from public;
grant execute on function public.crm_process_import_batch(uuid, integer, jsonb) to authenticated;

commit;