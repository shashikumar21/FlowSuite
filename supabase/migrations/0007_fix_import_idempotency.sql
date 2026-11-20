-- Follow-up to 0006: only OPEN jobs participate in upload idempotency.
-- Replaying an in-flight upload returns its existing job; importing the same
-- file again after a job has closed is intentional and creates a new job.
--
begin;

alter table public.contact_import_jobs
  drop constraint if exists contact_import_jobs_file_unique;

create unique index contact_import_jobs_file_unique
  on public.contact_import_jobs(tenant_id, file_hash, kind)
  where status in ('pending', 'processing');

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
    and j.kind = p_kind
    and j.status in ('pending', 'processing');
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

revoke all on function public.crm_start_import(uuid, text, text, integer, text, text, integer) from public;
grant execute on function public.crm_start_import(uuid, text, text, integer, text, text, integer) to authenticated;

commit;
