import { describe, expect, it } from 'vitest'
import medicalHistorySql from '../../../supabase/migrations/0043_patient_medical_history.sql?raw'

/**
 * Static contract only — no local Postgres is available. Hosted promotion must
 * still be smoke-tested with a rolled-back transaction and explicit approval.
 */
describe('0043 patient medical history migration contract', () => {
  it('adds the doctor role to memberships and invitations', () => {
    expect(medicalHistorySql).toContain("check (role in ('owner', 'admin', 'manager', 'doctor', 'employee'))")
    expect(medicalHistorySql).toContain("check (role in ('admin', 'manager', 'doctor', 'employee'))")
    expect(medicalHistorySql).toContain("new.role in ('admin', 'manager', 'doctor', 'employee')")
  })

  it('creates an append-only tenant-scoped table with consent', () => {
    expect(medicalHistorySql).toContain('create table if not exists public.patient_medical_history_entries')
    expect(medicalHistorySql).toContain('recorded_by uuid references public.profiles(id) on delete set null')
    expect(medicalHistorySql).toContain('foreign key (contact_id, tenant_id) references public.contacts(id, tenant_id)')
    expect(medicalHistorySql).toContain('check (consent_given is true)')
    expect(medicalHistorySql).toContain('alter table public.patient_medical_history_entries enable row level security')
    expect(medicalHistorySql).not.toContain('for update')
    expect(medicalHistorySql).not.toContain('for delete')
  })

  it('blocks direct client writes and gates RPCs by role and tenant', () => {
    expect(medicalHistorySql).toContain('revoke all on public.patient_medical_history_entries from public, anon, authenticated')
    expect(medicalHistorySql).toContain("array['owner', 'admin', 'doctor']")
    expect(medicalHistorySql).toContain("if not public.can_manage_medical_history(p_tenant) then")
    expect(medicalHistorySql).toContain("if p_consent_given is not true then")
    expect(medicalHistorySql).toContain('grant execute on function public.patient_medical_history_list(uuid, uuid) to authenticated')
    expect(medicalHistorySql).toContain('Patient consent is required')
  })

  it('audits only metadata, never medical values', () => {
    expect(medicalHistorySql).toContain("'patient_medical_history.created'")
    expect(medicalHistorySql).toContain("'patient_medical_history.viewed'")
    expect(medicalHistorySql).toContain("'consent_version', new.consent_version")
    expect(medicalHistorySql).toContain("'external_call', false")
    expect(medicalHistorySql).toContain("'auto_send', false")
    expect(medicalHistorySql).toContain("'ai_used', false")
    expect(medicalHistorySql).not.toContain("'allergies', new.allergies")
    expect(medicalHistorySql).not.toContain("'notes', new.notes")
    expect(medicalHistorySql).not.toContain("'medications', new.medications")
  })

  it('contains no external send or provider path', () => {
    const executable = medicalHistorySql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .toLowerCase()
    expect(executable).not.toContain('whatsapp')
    expect(executable).not.toContain('send_email')
    expect(executable).not.toContain('google')
  })
})
