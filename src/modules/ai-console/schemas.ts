import { z } from 'zod'

/**
 * Form schemas for the Milestone 4 admin console. Ranges mirror the checks in
 * 0014_milestone4_ai_communication.sql; the database RPCs remain authoritative.
 */

export const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'te', label: 'Telugu' },
] as const

export const toneOptions = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'conversational', label: 'Conversational' },
] as const

export const responseStyleOptions = [
  { value: 'short', label: 'Short' },
  { value: 'detailed', label: 'Detailed' },
] as const

export const agentStatusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
] as const

export const knowledgeCategoryOptions = [
  { value: 'business_profile', label: 'Business profile' },
  { value: 'service', label: 'Service' },
  { value: 'faq', label: 'FAQ' },
  { value: 'opening_hours', label: 'Opening hours' },
  { value: 'booking_policy', label: 'Booking policy' },
  { value: 'contact', label: 'Contact' },
  { value: 'other', label: 'Other' },
] as const

export const toolLabels: Record<string, string> = {
  answer_faq: 'Answer FAQs from approved knowledge',
  qualify_lead: 'Qualify leads (no numeric score)',
  lookup_services: 'Look up services',
  lookup_hours: 'Look up opening hours',
  lookup_availability: 'Check booking availability',
  create_booking: 'Create a booking (after RPC succeeds)',
  create_lead: 'Create a CRM lead',
  check_consent: 'Check communication consent',
  send_reply: 'Send a reply',
  handoff: 'Hand off to a human',
}

export const mutatingToolKeys = new Set(['qualify_lead', 'create_booking', 'create_lead', 'send_reply', 'handoff'])

export const credentialProviderOptions = [
  { value: 'whatsapp', label: 'WhatsApp Cloud API' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'resend', label: 'Resend (email)' },
  { value: 'exotel', label: 'Exotel (voice)' },
  { value: 'other', label: 'Other' },
] as const

export const templateCategoryOptions = [
  { value: 'acknowledgement', label: 'Acknowledgement' },
  { value: 'appointment_confirmation', label: 'Appointment confirmation' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'utility', label: 'Utility' },
  { value: 'marketing', label: 'Marketing' },
] as const

export const consentChannelOptions = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
  { value: 'voice', label: 'Voice' },
] as const

export const classificationLabels: Record<string, string> = {
  information_request: 'Information request',
  high_intent: 'High intent',
  future_follow_up: 'Future follow-up',
  not_interested: 'Not interested',
  unknown: 'Unknown',
}

export const agentSchema = z.object({
  name: z.string().trim().min(1, 'Give the agent a name').max(120),
  language: z.enum(['en', 'hi', 'te']),
  tone: z.enum(['friendly', 'professional', 'conversational']),
  response_style: z.enum(['short', 'detailed']),
  business_info: z.string().trim().max(4000),
  monthly_token_limit: z.union([z.literal(''), z.coerce.number().int().positive('Limit must be above zero')]),
  booking_permission: z.boolean(),
  handoff_user_id: z.string(),
  status: z.enum(['draft', 'active', 'paused']),
})
export type AgentFormValues = z.output<typeof agentSchema>
export type AgentFormInput = z.input<typeof agentSchema>

export const knowledgeSchema = z.object({
  agent_id: z.string().min(1, 'Select an agent'),
  category: z.enum(['business_profile', 'service', 'faq', 'opening_hours', 'booking_policy', 'contact', 'other']),
  title: z.string().trim().min(1, 'Add a title').max(200),
  content: z.string().trim().min(1, 'Add content').max(4000),
  language: z.enum(['en', 'hi', 'te']),
  active: z.boolean(),
})
export type KnowledgeFormValues = z.output<typeof knowledgeSchema>

export const credentialSchema = z.object({
  channel_id: z.string().min(1, 'Select a channel'),
  provider: z.enum(['whatsapp', 'openai', 'resend', 'exotel', 'other']),
  secret_ref: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{2,199}$/, 'Use an uppercase secret name such as WHATSAPP_ACCESS_TOKEN')
    .refine((value) => !value.startsWith('VITE_'), 'Secret names cannot start with VITE_'),
  external_identifier: z.string().trim().max(200),
})
export type CredentialFormValues = z.output<typeof credentialSchema>

export const templateSchema = z.object({
  template_key: z.string().trim().min(1, 'Add a template key').max(120),
  provider: z.enum(['whatsapp', 'sms', 'email', 'other']),
  provider_template_name: z.string().trim().max(200),
  language: z.enum(['en', 'hi', 'te']),
  category: z.enum(['acknowledgement', 'appointment_confirmation', 'reminder', 'follow_up', 'utility', 'marketing']),
  content: z.string().trim().min(1, 'Add template content').max(4000),
  status: z.enum(['draft', 'approved', 'rejected']),
})
export type TemplateFormValues = z.output<typeof templateSchema>

export const handoffSchema = z.object({
  to_user: z.string().min(1, 'Choose a team member'),
  reason: z.string().trim().max(200),
  note: z.string().trim().max(1000),
})
export type HandoffFormValues = z.output<typeof handoffSchema>

export const consentSchema = z.object({
  channel: z.enum(['whatsapp', 'sms', 'email', 'voice']),
  status: z.enum(['opt_in', 'opt_out']),
  source: z.enum(['website_chat', 'whatsapp', 'manual', 'import', 'staff', 'booking']),
})
export type ConsentFormValues = z.output<typeof consentSchema>
