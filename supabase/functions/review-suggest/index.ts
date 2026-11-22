// Review suggestion MVP: generates a short review draft for 4-5 star feedback.
// Public, token-scoped. Caches suggestion in DB. Uses AI provider if configured,
// otherwise returns a safe fallback template. No external sends.

import { z } from 'zod'
import { createServiceClient } from '../_shared/ai/store.ts'
import { createAiProvider } from '../_shared/ai/provider.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AI_PROVIDER = Deno.env.get('AI_PROVIDER') ?? undefined
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? undefined
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') ?? undefined
const OPENAI_BASE_URL = Deno.env.get('OPENAI_BASE_URL') ?? undefined
const AI_TIMEOUT_MS = Deno.env.get('AI_TIMEOUT_MS') ?? undefined
const AI_MAX_RETRIES = Deno.env.get('AI_MAX_RETRIES') ?? undefined

const payloadSchema = z.object({ token: z.string().min(20).max(200) })

function fallbackSuggestion(businessName: string, rating: number, feedback: string | null): string {
  const base = rating >= 5
    ? `I had a great experience at ${businessName}.`
    : `I had a very good experience at ${businessName}.`
  const extra = feedback?.trim() ? ` ${feedback.trim()}` : ' The team was professional and helpful.'
  return `${base}${extra} I would recommend them.`.slice(0, 600)
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed')
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return errorResponse(503, 'service_unavailable', 'Server configuration missing')

  let raw: unknown
  try { raw = await req.json() } catch { return errorResponse(400, 'invalid_json') }
  const parsed = payloadSchema.safeParse(raw)
  if (!parsed.success) return errorResponse(400, 'invalid_request')

  const admin = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data: row, error } = await admin.from('review_requests')
    .select('id, tenant_id, customer_name, rating, customer_feedback, ai_suggestion, ai_suggestion_status')
    .eq('public_token', parsed.data.token)
    .maybeSingle<{ id: string; tenant_id: string; customer_name: string | null; rating: number | null; customer_feedback: string | null; ai_suggestion: string | null; ai_suggestion_status: string }>()
  if (error) return errorResponse(500, 'lookup_failed')
  if (!row) return errorResponse(404, 'not_found', 'Review link not found')
  if (!row.rating) return errorResponse(400, 'rating_required', 'Please submit a rating first')
  if (row.rating < 4) return jsonResponse({ suggestion: null, reason: 'private_feedback' })
  if (row.ai_suggestion && row.ai_suggestion_status === 'generated') return jsonResponse({ suggestion: row.ai_suggestion, status: 'cached' })

  const { data: business } = await admin.from('businesses').select('name').eq('id', row.tenant_id).maybeSingle<{ name: string }>()
  const businessName = business?.name || 'our business'

  let suggestion = ''
  let status: 'generated' | 'fallback' | 'error' = 'fallback'
  try {
    const provider = createAiProvider({ AI_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL, AI_TIMEOUT_MS, AI_MAX_RETRIES })
    const system = `You write short, honest, natural-sounding customer review drafts.
Rules: 1-3 sentences, max 600 chars. No fake facts, no medical claims, no invented staff names, no guarantees. Use only provided context. Sound human and specific but safe. Return JSON {"suggestion":"..."}.`
    const user = `Business: ${businessName}\nRating: ${row.rating}/5\nCustomer feedback: ${row.customer_feedback || 'None provided'}\nWrite a polite public review draft the customer can edit and post.`
    const completion = await provider.complete({
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.4, maxTokens: 250,
      responseFormat: { name: 'review_suggestion', strict: true, schema: { type: 'object', additionalProperties: false, required: ['suggestion'], properties: { suggestion: { type: 'string', minLength: 10, maxLength: 600 } } } },
    })
    let candidate: unknown = completion.parsed
    if (candidate == null && completion.content.trim()) { try { candidate = JSON.parse(completion.content) } catch { /* ignore */ } }
    const out = z.object({ suggestion: z.string().min(10).max(600) }).safeParse(candidate)
    if (out.success) { suggestion = out.data.suggestion.trim(); status = 'generated' }
    else { suggestion = fallbackSuggestion(businessName, row.rating, row.customer_feedback); status = 'fallback' }
  } catch (e) {
    console.warn('review-suggest AI failed, using fallback', e)
    suggestion = fallbackSuggestion(businessName, row.rating, row.customer_feedback)
    status = 'fallback'
  }

  await admin.from('review_requests').update({
    ai_suggestion: suggestion, ai_suggestion_status: status, updated_at: new Date().toISOString(),
  }).eq('id', row.id)

  return jsonResponse({ suggestion, status })
})
