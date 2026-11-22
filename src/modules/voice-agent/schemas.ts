import { z } from 'zod'

export const voiceAgentStatuses = ['draft', 'active', 'paused', 'archived'] as const
export const voiceDirections = ['inbound', 'outbound', 'both'] as const
export const voiceBookingModes = ['lead_capture', 'booking_assist', 'disabled'] as const
export const voiceProviders = ['none', 'exotel', 'twilio', 'other'] as const
export const callStatuses = ['logged', 'queued', 'ringing', 'in_progress', 'completed', 'missed', 'failed', 'cancelled'] as const
export const callDirections = ['inbound', 'outbound'] as const
export const callProviders = ['manual', 'exotel', 'twilio', 'other'] as const
export const handoffStatuses = ['open', 'assigned', 'resolved', 'cancelled'] as const

export const voiceAgentSchema = z.object({
  name: z.string().trim().min(1, 'Agent name is required').max(120),
  status: z.enum(voiceAgentStatuses),
  direction: z.enum(voiceDirections),
  languages: z.array(z.string().trim().min(2).max(10)).min(1, 'Select at least one language'),
  greeting: z.string().trim().max(1000),
  faq_summary: z.string().trim().max(4000),
  booking_mode: z.enum(voiceBookingModes),
  handoff_phone: z.string().trim().max(30),
  provider: z.enum(voiceProviders),
  provider_phone_number: z.string().trim().max(30),
})
export type VoiceAgentFormValues = z.infer<typeof voiceAgentSchema>

export const callLogSchema = z.object({
  agent_id: z.string(),
  contact_id: z.string(),
  direction: z.enum(callDirections),
  status: z.enum(callStatuses),
  provider: z.enum(callProviders),
  from_number: z.string().trim().max(30),
  to_number: z.string().trim().max(30),
  language: z.string().trim().max(10),
  started_at: z.string(),
  ended_at: z.string(),
  duration_seconds: z.string().trim().regex(/^\d*$/, 'Enter whole seconds'),
  outcome: z.string().trim().max(200),
  summary: z.string().trim().max(2000),
  consent_recording: z.boolean(),
  needs_handoff: z.boolean(),
})
export type CallLogFormValues = z.infer<typeof callLogSchema>

export const handoffSchema = z.object({
  call_session_id: z.string().min(1, 'Call session is required'),
  reason: z.string().trim().min(1, 'Reason is required').max(500),
  assigned_to: z.string(),
  notes: z.string().trim().max(2000),
})
export type HandoffFormValues = z.infer<typeof handoffSchema>
