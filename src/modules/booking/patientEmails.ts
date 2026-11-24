import { z } from 'zod'
import { requireSupabase } from '@/integrations/supabase/client'
import type { PatientEmailKind, PatientEmailOutboxRow, PatientEmailSettingsRow, PatientEmailStatus } from '@/types/database'

export const patientEmailSettingsSchema = z.object({
  confirmations_enabled: z.boolean(),
  reminders_enabled: z.boolean(),
  reminder_hours_before: z.coerce.number().int().min(1, 'At least 1 hour').max(72, 'At most 72 hours'),
  review_emails_auto_approve: z.boolean(),
  reply_to_email: z.union([z.literal(''), z.string().trim().email('Enter a valid email').max(320)]),
})

export type PatientEmailSettingsInput = z.input<typeof patientEmailSettingsSchema>
export type PatientEmailSettingsValues = z.output<typeof patientEmailSettingsSchema>

export const defaultPatientEmailSettings: PatientEmailSettingsValues = {
  confirmations_enabled: false,
  reminders_enabled: false,
  reminder_hours_before: 24,
  review_emails_auto_approve: false,
  reply_to_email: '',
}

export function settingsToValues(row: PatientEmailSettingsRow | null): PatientEmailSettingsValues {
  if (!row) return defaultPatientEmailSettings
  return {
    confirmations_enabled: row.confirmations_enabled,
    reminders_enabled: row.reminders_enabled,
    reminder_hours_before: row.reminder_hours_before,
    review_emails_auto_approve: row.review_emails_auto_approve,
    reply_to_email: row.reply_to_email ?? '',
  }
}

export type PatientEmailOverview = {
  settings: PatientEmailSettingsRow | null
  recent: PatientEmailOutboxRow[]
}

export async function fetchPatientEmailOverview(tenantId: string): Promise<PatientEmailOverview> {
  const supabase = requireSupabase()
  const [settings, recent] = await Promise.all([
    supabase.from('patient_email_settings').select('*').eq('tenant_id', tenantId).maybeSingle(),
    supabase
      .from('patient_email_outbox')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])
  if (settings.error) throw settings.error
  if (recent.error) throw recent.error
  return { settings: settings.data ?? null, recent: recent.data ?? [] }
}

export async function updatePatientEmailSettings(tenantId: string, values: PatientEmailSettingsValues): Promise<void> {
  const { error } = await requireSupabase().rpc('patient_email_update_settings', {
    p_tenant: tenantId,
    p_confirmations_enabled: values.confirmations_enabled,
    p_reminders_enabled: values.reminders_enabled,
    p_reminder_hours_before: values.reminder_hours_before,
    p_review_emails_auto_approve: values.review_emails_auto_approve,
    p_reply_to_email: values.reply_to_email || null,
  })
  if (error) throw error
}

export const patientEmailKindLabels: Record<PatientEmailKind, string> = {
  booking_confirmation: 'Confirmation',
  booking_rescheduled: 'Rescheduled',
  booking_cancelled: 'Cancelled',
  appointment_reminder: 'Reminder',
  review_request: 'Review request',
}

export const patientEmailStatusLabels: Record<PatientEmailStatus, string> = {
  pending: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  skipped: 'Skipped',
  cancelled: 'Withdrawn',
}

/** Hides most of the address so the list is safe to show on a shared screen. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(local.length - 2, 6)))}@${domain}`
}
