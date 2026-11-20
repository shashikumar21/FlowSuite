import { z } from 'zod'

export const answerFaqSchema = z.object({
  question: z.string().trim().min(1).max(1000),
})

export const qualifyLeadSchema = z.object({
  classification: z.enum(['information_request', 'high_intent', 'future_follow_up', 'not_interested', 'unknown']),
  summary: z.string().trim().min(1).max(2000),
  intent: z.string().trim().max(200).nullish(),
  serviceInterest: z.string().trim().max(200).nullish(),
})

export const lookupServicesSchema = z.object({})

export const lookupHoursSchema = z.object({})

export const lookupAvailabilitySchema = z.object({
  serviceId: z.uuid(),
  date: z.iso.date(),
  resourceId: z.uuid().nullish(),
})

export const createBookingSchema = z.object({
  serviceId: z.uuid(),
  startAt: z.iso.datetime({ offset: true }),
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z.string().trim().min(3).max(30),
  customerEmail: z.email().max(200).nullish(),
  notes: z.string().trim().max(1000).nullish(),
  idempotencyKey: z.string().trim().min(8).max(200),
})

export const createLeadSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().max(120).nullish(),
  phone: z.string().trim().max(30).nullish(),
  email: z.email().max(200).nullish(),
  serviceInterest: z.string().trim().max(200).nullish(),
  notes: z.string().trim().max(2000).nullish(),
})

export const checkConsentSchema = z.object({
  channel: z.enum(['whatsapp', 'sms', 'email', 'voice']),
})

export const sendReplySchema = z.object({
  channel: z.enum(['whatsapp', 'website_chat']),
  content: z.string().trim().min(1).max(4000),
  idempotencyKey: z.string().trim().min(8).max(200),
})

export const handoffSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  note: z.string().trim().max(2000).nullish(),
  toUserId: z.uuid().nullish(),
})

export const TOOL_SCHEMAS = {
  answer_faq: answerFaqSchema,
  qualify_lead: qualifyLeadSchema,
  lookup_services: lookupServicesSchema,
  lookup_hours: lookupHoursSchema,
  lookup_availability: lookupAvailabilitySchema,
  create_booking: createBookingSchema,
  create_lead: createLeadSchema,
  check_consent: checkConsentSchema,
  send_reply: sendReplySchema,
  handoff: handoffSchema,
} as const

export type ToolInputMap = {
  [K in keyof typeof TOOL_SCHEMAS]: z.infer<(typeof TOOL_SCHEMAS)[K]>
}
