import { describe, expect, it } from 'vitest'
import documentsSql from '../../../supabase/migrations/0045_patient_documents_storage.sql?raw'

/**
 * Static contract only — no local Postgres or storage emulator is available.
 * Hosted promotion must still be smoke-tested in a rolled-back transaction.
 */
describe('0045 patient documents migration contract', () => {
  it('creates a private, size-limited bucket', () => {
    expect(documentsSql).toContain("'patient-documents'")
    expect(documentsSql).toContain('10485760')
    expect(documentsSql).toContain("array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']")
    expect(documentsSql).toContain('on conflict (id) do nothing')
  })

  it('does not attempt storage.objects policies the CLI role cannot create', () => {
    const executable = documentsSql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
    expect(executable).not.toContain('storage.objects')
    expect(executable).not.toContain('create policy')
    expect(executable).not.toContain('create trigger')
  })

  it('authorizes by user membership, clinical role and tenant-owned contact', () => {
    expect(documentsSql).toContain('create or replace function public.can_manage_patient_document_for_user(')
    expect(documentsSql).toContain("bm.role in ('owner', 'admin', 'doctor')")
    expect(documentsSql).toContain("bm.status = 'active'")
    expect(documentsSql).toContain('c.tenant_id = p_tenant')
    expect(documentsSql).toContain('public.patient_document_path_uuid(p_object_path, 1)')
    expect(documentsSql).toContain('public.patient_document_path_uuid(p_object_path, 2)')
  })

  it('rejects invalid paths and audited actions', () => {
    expect(documentsSql).toContain('v_path_tenant is distinct from p_tenant')
    expect(documentsSql).toContain('v_path_contact is distinct from p_contact')
    expect(documentsSql).toContain('Invalid patient document path')
    expect(documentsSql).toContain("'patient_document.upload_signed', 'patient_document.viewed', 'patient_document.deleted'")
  })

  it('audits only metadata and grants only the service role', () => {
    expect(documentsSql).toContain("'content_type', p_content_type")
    expect(documentsSql).toContain("'external_call', false")
    expect(documentsSql).toContain("'auto_send', false")
    expect(documentsSql).toContain("'ai_used', false")
    expect(documentsSql).not.toContain("'original_name',")
    expect(documentsSql).not.toContain("'name', p_object_path")
    expect(documentsSql).toContain('grant execute on function public.can_manage_patient_document_for_user(uuid, uuid, uuid) to service_role')
    expect(documentsSql).toContain('grant execute on function public.patient_document_audit_record(uuid, uuid, uuid, text, text, text) to service_role')
    expect(documentsSql).not.toMatch(/grant execute[^\n]*to authenticated/i)
  })

  it('contains no external send or provider path', () => {
    const executable = documentsSql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .toLowerCase()
    expect(executable).not.toContain('whatsapp')
    expect(executable).not.toContain('send_email')
    expect(executable).not.toContain('google')
    expect(executable).not.toContain('http')
  })
})
