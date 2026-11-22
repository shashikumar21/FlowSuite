import { describe, expect, it } from 'vitest'
import {
  approvalDecisionSchema,
  campaignCreateSchema,
  campaignStatuses,
  draftStatuses,
  editableDraftSchema,
  emailDraftInputSchema,
  emptyEmailDraftInput,
  generatedDraftSchema,
  outreachTones,
} from './schemas'

const PROSPECT_ID = '06a77082-53a2-4e9c-9c35-3214a76c9ba6'
const MESSAGE_ID = '35e188c6-d0a2-434f-8a09-e5ea348aff80'

const validInput = {
  prospect_id: PROSPECT_ID,
  business_website: 'https://example.com',
  industry: 'Dental',
  product_offered: 'Patient follow-up software',
  problem_addressed: 'Missed recall appointments',
  campaign_objective: 'Book a discovery call',
  tone: 'professional' as const,
}

const validDraft = {
  subject: 'A quick idea for your clinic',
  opening: 'I came across your practice and wanted to reach out.',
  body: 'Many clinics lose revenue when recall reminders are missed.',
  cta: 'Would a 15-minute call next week be useful?',
  follow_up_subject: 'Following up on my note',
  follow_up_body: 'Just checking whether this is worth a short conversation.',
}

describe('email draft input validation', () => {
  it('accepts a complete input and defaults optional context', () => {
    const result = emailDraftInputSchema.parse(validInput)
    expect(result.decision_maker_id).toBeNull()
    expect(result.business_website).toBe('https://example.com')
  })

  it('rejects an invalid prospect id', () => {
    const result = emailDraftInputSchema.safeParse({ ...validInput, prospect_id: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('rejects empty product, problem or objective', () => {
    for (const field of ['product_offered', 'problem_addressed', 'campaign_objective'] as const) {
      const result = emailDraftInputSchema.safeParse({ ...validInput, [field]: '   ' })
      expect(result.success, field).toBe(false)
    }
  })

  it('rejects an unsupported tone', () => {
    const result = emailDraftInputSchema.safeParse({ ...validInput, tone: 'aggressive' })
    expect(result.success).toBe(false)
  })

  it('starts from an empty draft with a safe default tone', () => {
    expect(emptyEmailDraftInput(PROSPECT_ID)).toMatchObject({
      prospect_id: PROSPECT_ID,
      tone: 'professional',
      product_offered: '',
    })
  })
})

describe('generated draft validation', () => {
  it('accepts the required model shape', () => {
    expect(generatedDraftSchema.parse(validDraft)).toEqual(validDraft)
  })

  it('rejects unknown fields so model drift cannot smuggle extra data', () => {
    const result = generatedDraftSchema.safeParse({ ...validDraft, internal_note: 'sent' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty or overlong subject', () => {
    expect(generatedDraftSchema.safeParse({ ...validDraft, subject: '' }).success).toBe(false)
    expect(generatedDraftSchema.safeParse({ ...validDraft, subject: 'x'.repeat(201) }).success).toBe(false)
  })

  it('requires a valid recipient email for an editable draft', () => {
    expect(editableDraftSchema.safeParse({ ...validDraft, recipient_email: 'nope' }).success).toBe(false)
    expect(editableDraftSchema.safeParse({ ...validDraft, recipient_email: 'person@example.com' }).success).toBe(true)
  })
})

describe('campaign creation validation', () => {
  const validCampaign = {
    name: 'Dental recalls',
    objective: 'Book a discovery call',
    tone: 'friendly' as const,
    product_offered: 'Recall software',
    problem_addressed: 'Missed appointments',
    prospect_ids: [PROSPECT_ID],
  }

  it('accepts at least one prospect', () => {
    expect(campaignCreateSchema.parse(validCampaign).prospect_ids).toEqual([PROSPECT_ID])
  })

  it('rejects an empty recipient selection', () => {
    expect(campaignCreateSchema.safeParse({ ...validCampaign, prospect_ids: [] }).success).toBe(false)
  })

  it('rejects invalid prospect ids', () => {
    expect(campaignCreateSchema.safeParse({ ...validCampaign, prospect_ids: ['abc'] }).success).toBe(false)
  })
})

describe('approval decision validation', () => {
  it('requires a reason to reject', () => {
    const result = approvalDecisionSchema.safeParse({ draft_id: MESSAGE_ID, decision: 'reject', reason: '' })
    expect(result.success).toBe(false)
  })

  it('allows approval without a reason', () => {
    expect(approvalDecisionSchema.safeParse({ draft_id: MESSAGE_ID, decision: 'approve' }).success).toBe(true)
  })

  it('validates edited content lengths', () => {
    expect(approvalDecisionSchema.safeParse({
      draft_id: MESSAGE_ID, decision: 'approve', edited_body: 'x'.repeat(10_001),
    }).success).toBe(false)
  })
})

describe('status unions mirror the database CHECK constraints', () => {
  it('campaign statuses match 0017', () => {
    expect([...campaignStatuses]).toEqual([
      'draft', 'pending_approval', 'approved', 'rejected',
      'active', 'paused', 'completed', 'cancelled',
    ])
  })

  it('draft statuses match 0017', () => {
    expect([...draftStatuses]).toEqual([
      'draft', 'pending_approval', 'approved', 'rejected',
      'queued', 'sent', 'failed', 'cancelled',
    ])
  })

  it('tones are limited to the supported set', () => {
    expect([...outreachTones]).toEqual(['professional', 'friendly', 'concise', 'consultative'])
  })
})
