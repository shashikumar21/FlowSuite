import { describe, expect, it } from 'vitest'
import type { SuppressionRow, TenantRole } from '@/types/database'
import type { GeneratedDraft } from './schemas'
import {
  UNWRITTEN_DRAFT_BODY,
  buildIdempotencyKey,
  campaignStatusLabel,
  canReviewOutreach,
  composeEmailBody,
  isSuppressed,
  isUnwrittenDraft,
  isValidEmail,
  messageStatusLabel,
  normalizeEmail,
  shortIdempotencyKey,
} from './utils'

const TENANT = '06a77082-53a2-4e9c-9c35-3214a76c9ba6'
const MESSAGE = '35e188c6-d0a2-434f-8a09-e5ea348aff80'

function suppression(email: string): SuppressionRow {
  return {
    id: 'row-1',
    tenant_id: TENANT,
    email,
    reason: 'unsubscribe',
    source: 'test',
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

describe('email validation and normalisation', () => {
  it('normalises case and whitespace', () => {
    expect(normalizeEmail('  Person@Example.COM ')).toBe('person@example.com')
  })

  it('accepts ordinary addresses and rejects malformed ones', () => {
    expect(isValidEmail('person@example.com')).toBe(true)
    expect(isValidEmail('person@localhost')).toBe(false)
    expect(isValidEmail('not-an-email')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })

  it('rejects addresses longer than 255 characters', () => {
    expect(isValidEmail(`${'a'.repeat(250)}@example.com`)).toBe(false)
  })
})

describe('suppression checks', () => {
  it('matches case-insensitively and after trimming', () => {
    expect(isSuppressed(' Person@Example.com ', [suppression('person@example.com')])).toBe(true)
  })

  it('does not match a different tenant-agnostic address', () => {
    expect(isSuppressed('other@example.com', [suppression('person@example.com')])).toBe(false)
  })

  it('fails closed for an empty address', () => {
    expect(isSuppressed('', [suppression('')])).toBe(false)
  })
})

describe('idempotency', () => {
  it('produces the same key as sales_queue_approved_email', () => {
    expect(buildIdempotencyKey(TENANT, MESSAGE)).toBe(`${TENANT}:${MESSAGE}`)
  })

  it('produces different keys for different messages or tenants', () => {
    expect(buildIdempotencyKey(TENANT, MESSAGE)).not.toBe(buildIdempotencyKey(TENANT, 'other'))
    expect(buildIdempotencyKey(TENANT, MESSAGE)).not.toBe(buildIdempotencyKey('other', MESSAGE))
  })

  it('truncates keys for display without hiding the prefix', () => {
    expect(shortIdempotencyKey(`${TENANT}:${MESSAGE}`)).toContain('…')
  })
})

describe('approval permission gating (UX only)', () => {
  it('allows owners and admins', () => {
    expect(canReviewOutreach('owner')).toBe(true)
    expect(canReviewOutreach('admin')).toBe(true)
  })

  it('denies other roles and undefined', () => {
    const denied: Array<TenantRole | undefined> = ['manager', 'employee', undefined]
    for (const role of denied) expect(canReviewOutreach(role)).toBe(false)
  })
})

describe('draft body helpers', () => {
  const draft: GeneratedDraft = {
    subject: 'Subject',
    opening: 'Opening line.',
    body: 'Main body.',
    cta: 'Call to action?',
    follow_up_subject: 'Follow up',
    follow_up_body: 'Reminder.',
  }

  it('composes opening, body and cta into the saved body', () => {
    expect(composeEmailBody(draft)).toBe('Opening line.\n\nMain body.\n\nCall to action?')
  })

  it('identifies the database placeholder without falsely matching real drafts', () => {
    expect(isUnwrittenDraft(UNWRITTEN_DRAFT_BODY)).toBe(true)
    expect(isUnwrittenDraft(draft.body)).toBe(false)
    expect(isUnwrittenDraft(null)).toBe(false)
  })
})

describe('status labels', () => {
  it('renders unknown statuses unchanged instead of inventing a label', () => {
    expect(campaignStatusLabel('pending_approval')).toBe('Awaiting approval')
    expect(messageStatusLabel('queued')).toBe('Queued')
    expect(campaignStatusLabel('mystery')).toBe('mystery')
  })
})
