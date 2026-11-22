import type { TenantRole } from '@/types/database'
import type { GeneratedDraft } from './schemas'
import type { SuppressionRow } from '@/types/database'

/** Client conveniences only. Supabase RPCs remain the authoritative check. */

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

export function isValidEmail(value: string | null | undefined): boolean {
  const email = normalizeEmail(value)
  return email.length <= 255 && EMAIL_RE.test(email)
}

export function isSuppressed(email: string, suppressionList: SuppressionRow[]): boolean {
  const target = normalizeEmail(email)
  if (!target) return false
  return suppressionList.some((entry) => normalizeEmail(entry.email) === target)
}

/** Must match the idempotency key built by sales_queue_approved_email in 0019. */
export function buildIdempotencyKey(tenantId: string, messageId: string): string {
  return `${tenantId}:${messageId}`
}

/**
 * UX-only gate. The database checks `can_manage_sales_agent()` again for every
 * review, queue, suppression and retry action.
 */
export function canReviewOutreach(role: TenantRole | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

/** Exact placeholder inserted by the database when a campaign is created. */
export const UNWRITTEN_DRAFT_BODY =
  'This draft has not been written yet. Open the AI Email Writer to create it.'

export function isUnwrittenDraft(body: string | null | undefined): boolean {
  return (body ?? '').trim() === UNWRITTEN_DRAFT_BODY
}

/** Combine the generated pieces into the single body saved on the message. */
export function composeEmailBody(draft: GeneratedDraft): string {
  return [draft.opening.trim(), draft.body.trim(), draft.cta.trim()].filter(Boolean).join('\n\n')
}

const CAMPAIGN_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const MESSAGE_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
  queued: 'Queued',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export function campaignStatusLabel(status: string): string {
  return CAMPAIGN_LABELS[status] ?? status
}

export function messageStatusLabel(status: string): string {
  return MESSAGE_LABELS[status] ?? status
}

/** Keep idempotency keys deterministic and safe to display in the UI. */
export function shortIdempotencyKey(key: string): string {
  return key.length > 18 ? `${key.slice(0, 18)}…` : key
}
