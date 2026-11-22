import { z } from 'zod'

/**
 * Phase 3 validation for AI email writing and campaigns.
 *
 * These schemas validate input and model output in the browser. The database
 * RPCs remain authoritative: nothing here can approve a message, queue a send,
 * bypass suppression or record a delivery. No provider key is read here.
 */

export const outreachTones = ['professional', 'friendly', 'concise', 'consultative'] as const
export type OutreachTone = (typeof outreachTones)[number]

// Mirrors the CHECK constraints in 0017_ai_sales_agent.sql exactly.
export const campaignStatuses = [
  'draft', 'pending_approval', 'approved', 'rejected',
  'active', 'paused', 'completed', 'cancelled',
] as const
export type CampaignStatus = (typeof campaignStatuses)[number]

export const draftStatuses = [
  'draft', 'pending_approval', 'approved', 'rejected',
  'queued', 'sent', 'failed', 'cancelled',
] as const
export type DraftStatus = (typeof draftStatuses)[number]

export const emailDraftInputSchema = z.object({
  prospect_id: z.string().uuid('Select a prospect'),
  decision_maker_id: z.string().uuid().nullable().default(null),
  business_website: z.string().trim().max(300).default(''),
  industry: z.string().trim().max(120).default(''),
  product_offered: z.string().trim().min(1, 'Describe what you offer').max(500),
  problem_addressed: z.string().trim().min(1, 'Describe the problem you solve').max(1000),
  campaign_objective: z.string().trim().min(1, 'Set a campaign objective').max(500),
  tone: z.enum(outreachTones),
})

export type EmailDraftInput = z.infer<typeof emailDraftInputSchema>

/** Strict shape required from the AI provider. Unknown fields are rejected. */
export const generatedDraftSchema = z
  .object({
    subject: z.string().trim().min(1).max(200),
    opening: z.string().trim().min(1).max(1000),
    body: z.string().trim().min(1).max(8000),
    cta: z.string().trim().min(1).max(500),
    follow_up_subject: z.string().trim().min(1).max(200),
    follow_up_body: z.string().trim().min(1).max(4000),
  })
  .strict()

export type GeneratedDraft = z.infer<typeof generatedDraftSchema>

export const editableDraftSchema = generatedDraftSchema.extend({
  recipient_email: z.string().trim().email('Enter a valid recipient email'),
})

export type EditableDraft = z.infer<typeof editableDraftSchema>

export const campaignCreateSchema = z.object({
  name: z.string().trim().min(1, 'Campaign name is required').max(120),
  objective: z.string().trim().min(1, 'Objective is required').max(500),
  tone: z.enum(outreachTones),
  product_offered: z.string().trim().min(1).max(500),
  problem_addressed: z.string().trim().min(1).max(1000),
  prospect_ids: z.array(z.string().uuid()).min(1, 'Select at least one prospect').max(500),
})

export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>

export const approvalDecisionSchema = z
  .object({
    draft_id: z.string().uuid(),
    decision: z.enum(['approve', 'reject']),
    edited_subject: z.string().trim().min(1).max(200).optional(),
    edited_body: z.string().trim().min(1).max(8000).optional(),
    reason: z.string().trim().max(500).default(''),
  })
  // The database enforces the same rule; this gives immediate UX feedback.
  .superRefine((value, context) => {
    if (value.decision === 'reject' && value.reason.length === 0) {
      context.addIssue({ code: 'custom', path: ['reason'], message: 'A rejection reason is required' })
    }
  })

export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>

export function emptyEmailDraftInput(prospectId: string): EmailDraftInput {
  return {
    prospect_id: prospectId,
    decision_maker_id: null,
    business_website: '',
    industry: '',
    product_offered: '',
    problem_addressed: '',
    campaign_objective: '',
    tone: 'professional',
  }
}
