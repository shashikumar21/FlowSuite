import { z } from 'zod'

/**
 * Form schemas for the CRM module. They mirror the validation performed by the
 * trusted RPCs in 0004_milestone2_crm.sql; the database remains authoritative.
 */

export const leadStatuses = ['new', 'contacted', 'qualified', 'unqualified', 'converted'] as const
export const contactStatuses = ['lead', 'customer', 'inactive'] as const
export const activityKinds = ['note', 'call', 'email', 'meeting', 'task'] as const

export const contactSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(100),
  last_name: z.string().trim().max(100),
  email: z.union([z.string().trim().email('Enter a valid email address'), z.literal('')]),
  phone: z.string().trim().max(30),
  company: z.string().trim().max(150),
  source_id: z.string(),
  notes: z.string().trim().max(2000),
  lead_status: z.enum(leadStatuses),
  status: z.enum(contactStatuses),
  assigned_to: z.string(),
  follow_up_at: z.string(),
  clinic: z.string().trim().max(200),
  area: z.string().trim().max(200),
  mobile: z.string().trim().max(30).regex(/^[+\d\s()-]*$/, 'Use digits, spaces, +, - or parentheses only'),
  rating: z
    .string()
    .trim()
    .regex(/^(?:[0-4](?:\.\d)?|5(?:\.0)?|)$/, 'Enter a rating from 0 to 5 with at most one decimal place'),
  reviews: z.string().trim().regex(/^\d*$/, 'Enter a whole number of 0 or more'),
  why_included: z.string().trim().max(2000),
  google_maps_url: z.union([z.string().trim().url('Enter a valid URL').max(2000), z.literal('')]),
  sent: z.boolean(),
  reply_1: z.string().trim().max(4000),
})
export type ContactFormValues = z.infer<typeof contactSchema>

export const dealSchema = z.object({
  title: z.string().trim().min(1, 'Deal title is required').max(160),
  contact_id: z.string().min(1, 'Select a contact'),
  pipeline_id: z.string().min(1, 'Select a pipeline'),
  stage_id: z.string().min(1, 'Select a stage'),
  value: z.coerce.number().finite().min(0, 'Value cannot be negative'),
  currency: z.string().trim().length(3),
  assigned_to: z.string(),
  expected_close_date: z.string(),
  description: z.string().trim().max(2000),
})
/** Coerced output passed to RPCs. */
export type DealFormValues = z.output<typeof dealSchema>
/** Raw form shape — `value` starts as a string from the number input. */
export type DealFormInput = z.input<typeof dealSchema>

/** Editing an existing deal's value is validated with the same rules as create. */
export const dealValueSchema = z.object({
  value: z.coerce.number().finite().min(0, 'Value cannot be negative'),
})
export type DealValueValues = z.output<typeof dealValueSchema>

export const activitySchema = z.object({
  type: z.enum(activityKinds),
  subject: z.string().trim().max(150),
  body: z.string().trim().min(1, 'Write something first').max(2000),
})
export type ActivityFormValues = z.infer<typeof activitySchema>

export const pipelineSchema = z.object({
  name: z.string().trim().min(2, 'Pipeline name is required').max(80),
  description: z.string().trim().max(300),
  color: z.string().trim().max(20),
})
export type PipelineFormValues = z.infer<typeof pipelineSchema>

export const stageSchema = z.object({
  name: z.string().trim().min(1, 'Stage name is required').max(80),
  probability: z.coerce.number().int().min(0).max(100),
  is_closed: z.boolean(),
  is_won: z.boolean(),
  color: z.string().trim().max(20),
})
export type StageFormValues = z.output<typeof stageSchema>
export type StageFormInput = z.input<typeof stageSchema>

export const sourceTypes = ['website', 'whatsapp', 'referral', 'walk_in', 'advertisement', 'manual', 'other'] as const
export const sourceSchema = z.object({
  name: z.string().trim().min(1, 'Source name is required').max(80),
  type: z.enum(sourceTypes),
})
export type SourceFormValues = z.infer<typeof sourceSchema>

export const customFieldTypes = ['text', 'textarea', 'number', 'date', 'select', 'multiselect', 'boolean'] as const
export const customFieldSchema = z.object({
  entity_type: z.enum(['contact', 'lead', 'deal']),
  key: z.string().trim().min(1, 'Key is required').max(50).regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase letters, numbers and underscores'),
  label: z.string().trim().min(1, 'Label is required').max(80),
  type: z.enum(customFieldTypes),
})
export type CustomFieldFormValues = z.infer<typeof customFieldSchema>

export const tagSchema = z.object({
  name: z.string().trim().min(1, 'Tag name is required').max(50),
  color: z.string().trim().max(20),
})
export type TagFormValues = z.infer<typeof tagSchema>
