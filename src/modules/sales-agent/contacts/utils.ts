import type { Json, TenantRole } from '@/types/database'
import type { ReplyClassification, ReplyStatus, SignalType, VerificationStatus } from './schemas'

/** Client conveniences only. The Phase 4 RPCs remain authoritative. */

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

/** No provider is configured; manual entry is the only accepted source. */
export const MANUAL_PROVIDER = 'manual'

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

export function isValidEmail(value: string | null | undefined): boolean {
  const email = normalizeEmail(value)
  return email.length <= 255 && EMAIL_RE.test(email)
}

/** Evidence for a manual attestation. Never claims a provider checked it. */
export function buildManualEvidence(note: string): Json {
  return { note: note.trim(), method: 'manual' } as unknown as Json
}

const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  unverified: 'Unverified',
  pending: 'Pending',
  verified: 'Verified by a person',
  invalid: 'Invalid',
  unknown: 'Unknown',
}

const SIGNAL_LABELS: Record<SignalType, string> = {
  note: 'Note',
  website: 'Website',
  news: 'News',
  referral: 'Referral',
  other: 'Other',
}

const CLASSIFICATION_LABELS: Record<ReplyClassification, string> = {
  interested: 'Interested',
  not_interested: 'Not interested',
  follow_up_required: 'Follow-up required',
  unsubscribe: 'Unsubscribe',
  unknown: 'Unknown',
}

const REPLY_STATUS_LABELS: Record<ReplyStatus, string> = {
  unread: 'Unread',
  read: 'Read',
  archived: 'Archived',
}

export function verificationLabel(status: string): string {
  return VERIFICATION_LABELS[status as VerificationStatus] ?? status
}

export function signalLabel(type: string): string {
  return SIGNAL_LABELS[type as SignalType] ?? type
}

export function classificationLabel(value: string): string {
  return CLASSIFICATION_LABELS[value as ReplyClassification] ?? value
}

export function replyStatusLabel(value: string): string {
  return REPLY_STATUS_LABELS[value as ReplyStatus] ?? value
}

/** Classifying a reply as unsubscribe suppresses the sender on the server. */
export function impliesSuppression(value: ReplyClassification): boolean {
  return value === 'unsubscribe'
}

/**
 * UX-only gate for destructive actions. The Phase 4 RPCs re-check
 * `can_manage_sales_agent()` server-side before deleting anything.
 */
export function canManageContacts(role: TenantRole | undefined): boolean {
  return role === 'owner' || role === 'admin'
}
