import { requireSupabase } from '@/integrations/supabase/client'

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

export async function submitPublicReviewFeedback(token: string, rating: number, feedback: string): Promise<void> {
  const { error } = await requireSupabase().rpc('public_review_submit_feedback' as never, {
    p_token: token, p_rating: rating, p_feedback: feedback || null,
  } as never)
  if (error) throw error
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
  ai_suggestion_status: string | null
  public_token: string | null
  scheduled_for: string | null
  created_at: string
}

export async function fetchReviewRequests(tenantId: string): Promise<ReviewRequestRow[]> {
  const { data, error } = await requireSupabase()
    .from('review_requests' as never)
    .select('id,tenant_id,customer_name,customer_phone,channel,review_link_type,review_url,status,rating,ai_suggestion_status,public_token,scheduled_for,created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50)
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
