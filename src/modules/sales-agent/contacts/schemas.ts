import { z } from 'zod'

/**
 * Phase 4 validation for decision makers, verification evidence, research
 * signals and manually recorded replies. These mirror the CHECK constraints in
 * 0017 and 0020; the RPCs remain the authoritative enforcement point.
 */

export const verificationStatuses = [
  'unverified', 'pending', 'verified', 'invalid', 'unknown',
] as const
export type VerificationStatus = (typeof verificationStatuses)[number]

export const signalTypes = ['note', 'website', 'news', 'referral', 'other'] as const
export type SignalType = (typeof signalTypes)[number]

export const replyClassifications = [
  'interested', 'not_interested', 'follow_up_required', 'unsubscribe', 'unknown',
] as const
export type ReplyClassification = (typeof replyClassifications)[number]

export const replyStatuses = ['unread', 'read', 'archived'] as const
export type ReplyStatus = (typeof replyStatuses)[number]

const optionalText = (max: number) =>
  z.union([z.string().trim().max(max), z.null()]).transform((value) => value?.trim() || null)

export const decisionMakerSchema = z.object({
  prospect_id: z.string().uuid('Select a prospect'),
  full_name: z.string().trim().min(1, 'Full name is required').max(150),
  job_title: optionalText(150),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address')]),
  phone: optionalText(40),
  linkedin_url: optionalText(300),
  research_source: optionalText(200),
})

export type DecisionMakerFormValues = z.infer<typeof decisionMakerSchema>

export function emptyDecisionMakerForm(prospectId: string): DecisionMakerFormValues {
  return {
    prospect_id: prospectId,
    full_name: '',
    job_title: null,
    email: '',
    phone: null,
    linkedin_url: null,
    research_source: null,
  }
}

export const verificationSchema = z.object({
  entity_type: z.enum(['prospect', 'decision_maker']),
  entity_id: z.string().uuid(),
  status: z.enum(verificationStatuses),
  // No verification provider exists in this phase; manual attestation only.
  method: z.literal('manual'),
  note: z.string().trim().max(1000).default(''),
})

export type VerificationFormValues = z.infer<typeof verificationSchema>

export const signalSchema = z.object({
  prospect_id: z.string().uuid('Select a prospect'),
  signal_type: z.enum(signalTypes),
  summary: z.string().trim().min(1, 'Add a short summary').max(2000),
  source_url: optionalText(500),
})

export type SignalFormValues = z.infer<typeof signalSchema>

export const replySchema = z.object({
  prospect_id: z.string().uuid('Select a prospect'),
  message_id: z.string().uuid().nullable(),
  campaign_id: z.string().uuid().nullable(),
  sender_email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address')]),
  subject: optionalText(200),
  body: optionalText(10000),
  classification: z.enum(replyClassifications),
  external_id: optionalText(200),
  received_at: z.string().datetime({ offset: true }).nullable(),
})

export type ReplyFormValues = z.infer<typeof replySchema>

export const replyTriageSchema = z.object({
  reply_id: z.string().uuid(),
  reply_status: z.enum(replyStatuses),
  classification: z.enum(replyClassifications),
})

export type ReplyTriageValues = z.infer<typeof replyTriageSchema>

export function emptyReplyForm(prospectId: string): ReplyFormValues {
  return {
    prospect_id: prospectId,
    message_id: null,
    campaign_id: null,
    sender_email: '',
    subject: null,
    body: null,
    classification: 'unknown',
    external_id: null,
    received_at: null,
  }
}
