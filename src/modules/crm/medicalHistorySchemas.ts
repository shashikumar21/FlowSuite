import { z } from 'zod'

/**
 * Patient medical history is sensitive data. These schemas mirror the limits in
 * 0043_patient_medical_history.sql; the trusted RPC remains authoritative.
 * No field here is ever sent to AI, WhatsApp, email or a public booking page.
 */
export const CONSENT_VERSION = 'medical-history-v1'

const optionalNote = (max: number, label: string) =>
  z.string().trim().max(max, `${label} is too long`)

export const medicalHistoryFormSchema = z.object({
  allergies: optionalNote(2000, 'Allergies'),
  conditions: optionalNote(2000, 'Conditions'),
  medications: optionalNote(2000, 'Medications'),
  past_treatments: optionalNote(4000, 'Past treatments'),
  family_history: optionalNote(2000, 'Family history'),
  notes: optionalNote(4000, 'Notes'),
  consent_given: z.boolean().refine((value) => value, 'Patient consent is required'),
})
export type MedicalHistoryFormValues = z.infer<typeof medicalHistoryFormSchema>

export const medicalHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  contact_id: z.string().uuid(),
  recorded_at: z.string(),
  recorded_by: z.string().uuid(),
  allergies: z.string().nullable(),
  conditions: z.string().nullable(),
  medications: z.string().nullable(),
  past_treatments: z.string().nullable(),
  family_history: z.string().nullable(),
  notes: z.string().nullable(),
  consent_version: z.string().min(1),
  consent_given_at: z.string(),
})
export type MedicalHistoryEntry = z.infer<typeof medicalHistoryEntrySchema>

export const medicalHistoryEntriesSchema = z.array(medicalHistoryEntrySchema)
