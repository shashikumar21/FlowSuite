import { describe, expect, it } from 'vitest'
import {
  decisionMakerSchema,
  emptyDecisionMakerForm,
  emptyReplyForm,
  replySchema,
  replyTriageSchema,
  signalSchema,
  verificationSchema,
} from './schemas'
import { buildManualEvidence, impliesSuppression, isValidEmail, normalizeEmail } from './utils'

const PROSPECT = '06a77082-53a2-4e9c-9c35-3214a76c9ba6'
const ENTITY = '35e188c6-d0a2-434f-8a09-e5ea348aff80'

describe('decision maker validation', () => {
  it('accepts a complete person and normalises optional text to null', () => {
    const result = decisionMakerSchema.parse({
      prospect_id: PROSPECT,
      full_name: '  Dr. Mehta  ',
      job_title: '   ',
      email: 'dr@example.com',
      phone: '',
      linkedin_url: 'https://linkedin.com/in/example',
      research_source: 'Website',
    })
    expect(result.full_name).toBe('Dr. Mehta')
    expect(result.job_title).toBeNull()
    expect(result.phone).toBeNull()
  })

  it('rejects a missing name, bad email or invalid prospect', () => {
    const base = { ...emptyDecisionMakerForm(PROSPECT), full_name: 'A Person' }
    expect(decisionMakerSchema.safeParse({ ...base, full_name: '' }).success).toBe(false)
    expect(decisionMakerSchema.safeParse({ ...base, email: 'not-an-email' }).success).toBe(false)
    expect(decisionMakerSchema.safeParse({ ...base, prospect_id: 'bad' }).success).toBe(false)
  })
})

describe('manual verification validation', () => {
  it('accepts manual attestation with a note', () => {
    const result = verificationSchema.parse({
      entity_type: 'decision_maker',
      entity_id: ENTITY,
      status: 'verified',
      method: 'manual',
      note: 'Called the front desk and confirmed the name.',
    })
    expect(result.status).toBe('verified')
    expect(result.note).toContain('front desk')
  })

  it('refuses any provider method until a real provider is configured', () => {
    const result = verificationSchema.safeParse({
      entity_type: 'prospect',
      entity_id: PROSPECT,
      status: 'verified',
      method: 'provider',
      note: 'Claimed by a provider',
    })
    expect(result.success).toBe(false)
  })

  it('builds evidence that never names a provider', () => {
    const evidence = buildManualEvidence('Checked the company website.') as Record<string, unknown>
    expect(evidence).toEqual({ note: 'Checked the company website.', method: 'manual' })
    expect(evidence.provider).toBeUndefined()
  })
})

describe('signal validation', () => {
  it('requires a prospect, a known type and a summary', () => {
    const good = { prospect_id: PROSPECT, signal_type: 'website' as const, summary: 'New location opened', source_url: '' }
    expect(signalSchema.parse(good).source_url).toBeNull()
    expect(signalSchema.safeParse({ ...good, signal_type: 'magic' }).success).toBe(false)
    expect(signalSchema.safeParse({ ...good, summary: '   ' }).success).toBe(false)
  })
})

describe('reply validation', () => {
  it('accepts a manual reply with an ISO timestamp', () => {
    const result = replySchema.parse({
      ...emptyReplyForm(PROSPECT),
      sender_email: 'Owner@Example.com',
      body: 'Please remove me from your list.',
      classification: 'unsubscribe',
      received_at: new Date('2026-01-05T10:00:00Z').toISOString(),
    })
    expect(result.classification).toBe('unsubscribe')
    expect(result.sender_email).toBe('Owner@Example.com')
  })

  it('rejects invalid classification and timestamps', () => {
    const base = { ...emptyReplyForm(PROSPECT), classification: 'unknown' as const }
    expect(replySchema.safeParse({ ...base, classification: 'excited' }).success).toBe(false)
    expect(replySchema.safeParse({ ...base, received_at: 'yesterday' }).success).toBe(false)
  })

  it('validates triage changes independently of reply creation', () => {
    expect(replyTriageSchema.safeParse({ reply_id: ENTITY, reply_status: 'read', classification: 'interested' }).success).toBe(true)
    expect(replyTriageSchema.safeParse({ reply_id: 'bad', reply_status: 'read', classification: 'interested' }).success).toBe(false)
  })

  it('flags unsubscribe as the only classification that suppresses a sender', () => {
    expect(impliesSuppression('unsubscribe')).toBe(true)
    for (const value of ['interested', 'not_interested', 'follow_up_required', 'unknown'] as const) {
      expect(impliesSuppression(value)).toBe(false)
    }
  })
})

describe('email helpers', () => {
  it('normalises and validates sender addresses', () => {
    expect(normalizeEmail('  Owner@Example.COM ')).toBe('owner@example.com')
    expect(isValidEmail('Owner@Example.COM')).toBe(true)
    expect(isValidEmail('nope')).toBe(false)
  })
})
