import { z } from 'zod'
import { requireSupabase } from '@/integrations/supabase/client'

const reviewAuditSchema = z.array(z.object({
  id: z.number(),
  action: z.string(),
  actor_id: z.string().nullable(),
  created_at: z.string(),
  metadata: z.record(z.string(), z.unknown()),
}))

export type PublicReview = {
  id: string
  business_name: string
  customer_name: string | null
  rating: number | null
  customer_feedback: string | null
  ai_suggestion: string | null
  ai_suggestion_status: string | null
  feedback_submitted_at: string | null
  review_link_type: string | null
  review_url: string | null
  status: string | null
}

export async function fetchPublicReview(token: string): Promise<PublicReview | null> {
  const { data, error } = await requireSupabase().rpc('public_review_get' as never, { p_token: token } as never)
  if (error) throw error
  return (data ?? null) as PublicReview | null
}

const publicReviewSubmitSchema = z.object({
  id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  follow_up_task_created: z.boolean().optional().default(false),
})

export type PublicReviewSubmitResult = {
  id: string
  rating: number
  followUpTaskCreated: boolean
}

export async function submitPublicReviewFeedback(
  token: string,
  rating: number,
  feedback: string,
): Promise<PublicReviewSubmitResult> {
  const { data, error } = await requireSupabase().rpc('public_review_submit_feedback' as never, {
    p_token: token, p_rating: rating, p_feedback: feedback || null,
  } as never)
  if (error) throw error
  const parsed = publicReviewSubmitSchema.parse(data)
  return {
    id: parsed.id,
    rating: parsed.rating,
    followUpTaskCreated: parsed.follow_up_task_created,
  }
}

export async function markReviewClicked(token: string): Promise<void> {
  await requireSupabase().rpc('public_review_mark_clicked' as never, { p_token: token } as never)
}

export async function generateReviewSuggestion(token: string): Promise<{ suggestion: string | null; status?: string; reason?: string }> {
  const { data, error } = await requireSupabase().functions.invoke('review-suggest', { body: { token } })
  if (error) throw error
  return (data ?? {}) as { suggestion: string | null; status?: string; reason?: string }
}

export type ReviewRequestRow = {
  id: string
  tenant_id: string
  customer_name: string | null
  customer_phone: string | null
  channel: string
  review_link_type: string
  review_url: string | null
  status: string
  rating: number | null
  customer_feedback: string | null
  ai_suggestion_status: string | null
  public_token: string | null
  scheduled_for: string | null
  created_at: string
}

export async function fetchReviewRequests(tenantId: string): Promise<ReviewRequestRow[]> {
  const { data, error } = await requireSupabase().rpc('review_requests_list_for_ui' as never, {
    p_tenant: tenantId,
  } as never)
  if (error) throw error
  return (data ?? []) as unknown as ReviewRequestRow[]
}

export async function ensureReviewRequestToken(tenantId: string, requestId: string): Promise<string> {
  const { data, error } = await requireSupabase().rpc('review_request_ensure_token' as never, {
    p_tenant: tenantId, p_request: requestId,
  } as never)
  if (error) throw error
  return data as string
}

export async function setReviewRequestStatus(tenantId: string, requestId: string, status: 'approved' | 'cancelled'): Promise<void> {
  const { error } = await requireSupabase().rpc('review_request_set_status' as never, {
    p_tenant: tenantId, p_request: requestId, p_status: status,
  } as never)
  if (error) throw error
}

export async function sendReviewRequestWhatsApp(tenantId: string, requestId: string): Promise<{ ok: boolean; status: string; provider_message_id?: string | null }> {
  const { data, error } = await requireSupabase().functions.invoke('review-request-send-whatsapp', {
    body: { tenant_id: tenantId, review_request_id: requestId },
  })
  if (error) throw error
  return (data ?? { ok: false, status: 'error' }) as { ok: boolean; status: string; provider_message_id?: string | null }
}

export type ReviewAuditRow = {
  id: number
  action: string
  actor_id: string | null
  created_at: string
  metadata: Record<string, unknown>
}

export async function fetchReviewAudit(tenantId: string): Promise<ReviewAuditRow[]> {
  const { data, error } = await requireSupabase()
    .from('audit_logs' as never)
    .select('id,action,actor_id,created_at,metadata')
    .eq('tenant_id', tenantId)
    .in('action', [
      'review_request.approved',
      'review_request.cancelled',
      'review_request.sent',
      'review_request.send_failed',
      'review_request.send_blocked',
      'review_request.rating_followup_created',
      'review_request.google_link_missing',
      'business.review_settings_updated',
      'review_reply.source_added',
      'review_reply.generated',
      'review_reply.approved',
      'review_reply.rejected',
      'review_reply.copied',
    ])
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return reviewAuditSchema.parse(data ?? [])
}

export async function updateBusinessReviewSettings(
  tenantId: string,
  googleReviewUrl: string | null,
): Promise<void> {
  const { error } = await requireSupabase().rpc('business_update_review_settings' as never, {
    p_tenant: tenantId,
    p_google_review_url: googleReviewUrl,
  } as never)
  if (error) throw error
}

export async function setReviewReplySource(
  tenantId: string,
  reviewRequestId: string,
  rating: number,
  feedback: string,
): Promise<void> {
  const parsed = z.object({
    rating: z.number().int().min(1).max(5),
    feedback: z.string().trim().max(1000),
  }).safeParse({ rating, feedback })
  if (!parsed.success) throw new Error('Enter a rating from 1 to 5 and review text under 1000 characters')
  const { error } = await requireSupabase().rpc('review_reply_set_source' as never, {
    p_tenant: tenantId,
    p_request: reviewRequestId,
    p_rating: parsed.data.rating,
    p_feedback: parsed.data.feedback || null,
  } as never)
  if (error) throw error
}

export type ReviewReplyDraft = {
  draft: string
  status: 'generated' | 'fallback'
}

export async function generateOwnerReviewReply(
  tenantId: string,
  reviewRequestId: string,
): Promise<ReviewReplyDraft> {
  const { data, error } = await requireSupabase().functions.invoke('review-reply-suggest', {
    body: { tenant_id: tenantId, review_request_id: reviewRequestId },
  })
  if (error) throw error
  const parsed = z.object({
    draft: z.string().min(10).max(600),
    status: z.enum(['generated', 'fallback']),
  }).safeParse(data)
  if (!parsed.success) throw new Error('Unexpected reply draft response')
  return parsed.data
}

export async function setReviewReplyStatus(
  tenantId: string,
  reviewRequestId: string,
  status: 'approved' | 'rejected' | 'copied',
): Promise<void> {
  const { error } = await requireSupabase().rpc('review_reply_set_status' as never, {
    p_tenant: tenantId,
    p_request: reviewRequestId,
    p_status: status,
  } as never)
  if (error) throw error
}
