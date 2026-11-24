-- LOCAL ONLY — patient document scans/uploads for dental clinics.
-- Contract:
--   * Private Supabase Storage bucket `patient-documents`; no public URLs.
--   * Object paths are `<tenant_id>/<contact_id>/<uuid>.<ext>`.
--   * The CLI/postgres role cannot own storage.objects, so this migration does
--     not add storage.objects RLS policies. A trusted Edge Function with the
--     service role signs all uploads/downloads and validates every request.
--   * Authorization rechecks active tenant membership, owner/admin/doctor role
--     and that the contact belongs to the same tenant.
--   * Audit logs record metadata only: tenant, contact, action, content type
--     and safety flags. No file names or file contents are logged.
--   * No email, WhatsApp, AI, Google or public booking path is introduced.
-- Hosted apply is approval-gated. Do not re-apply once hosted.

begin;

-- ---------------------------------------------------------------------------
-- 1. Private bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-documents',
  'patient-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Path helpers and server-side authorization
-- ---------------------------------------------------------------------------

create or replace function public.patient_document_path_uuid(p_name text, p_index integer)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_part text := nullif((storage.foldername(p_name))[p_index], '');
begin
  if v_part ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_part::uuid;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

create or replace function public.can_manage_patient_document_for_user(
  p_tenant uuid,
  p_contact uuid,
  p_user uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members bm
    where bm.tenant_id = p_tenant
      and bm.user_id = p_user
      and bm.status = 'active'
      and bm.role in ('owner', 'admin', 'doctor')
  )
  and exists (
    select 1
    from public.contacts c
    where c.id = p_contact
      and c.tenant_id = p_tenant
  );
$$;

create or replace function public.patient_document_audit_record(
  p_tenant uuid,
  p_contact uuid,
  p_user uuid,
  p_object_path text,
  p_action text,
  p_content_type text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path_tenant uuid := public.patient_document_path_uuid(p_object_path, 1);
  v_path_contact uuid := public.patient_document_path_uuid(p_object_path, 2);
begin
  if p_action not in ('patient_document.upload_signed', 'patient_document.viewed', 'patient_document.deleted') then
    raise exception 'Invalid audit action';
  end if;
  if v_path_tenant is distinct from p_tenant or v_path_contact is distinct from p_contact then
    raise exception 'Invalid patient document path';
  end if;
  if not public.can_manage_patient_document_for_user(p_tenant, p_contact, p_user) then
    raise exception 'Access denied';
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant,
    p_user,
    p_action,
    'patient_document',
    p_contact::text,
    jsonb_build_object(
      'content_type', p_content_type,
      'external_call', false,
      'auto_send', false,
      'ai_used', false
    )
  );
end;
$$;

revoke all on function public.patient_document_path_uuid(text, integer) from public, anon, authenticated;
revoke all on function public.can_manage_patient_document_for_user(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.patient_document_audit_record(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.patient_document_path_uuid(text, integer) to service_role;
grant execute on function public.can_manage_patient_document_for_user(uuid, uuid, uuid) to service_role;
grant execute on function public.patient_document_audit_record(uuid, uuid, uuid, text, text, text) to service_role;

commit;
