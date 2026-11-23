// Approval-gated WhatsApp send for review requests. NO auto-send.
// Authenticated tenant manager+ explicitly triggers send for an approved review request.

import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '../_shared/ai/store.ts'
import { sendWhatsAppMessage, WhatsAppSendError } from '../_shared/ai/whatsapp_send.ts'
import { getVaultSecret } from '../_shared/vault.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/http.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ENC_KEY = Deno.env.get('CREDENTIALS_ENCRYPTION_KEY') ?? ''

const schema = z.object({
  tenant_id: z.string().uuid(),
  review_request_id: z.string().uuid(),
})

function buildMessage(row: {
  customer_name: string | null
  message_template: string | null
  review_link_type: string | null
  review_url: string | null
  public_token: string | null
}, origin: string): string {
  const name = row.customer_name?.trim() || 'there'
  const link = row.review_link_type === 'flowsuite' && row.public_token
    ? `${origin.replace(/\/$/, '')}/r/${row.public_token}`
    : (row.review_url?.trim() || '')
  if (row.message_template?.trim()) {
    return row.message_template.replace(/\{name\}/gi, name).replace(/\{link\}/gi, link).slice(0, 1000)
  }
  const base = `Hi ${name}, thank you for visiting us. We'd love your feedback.`
  return link ? `${base} Please share your review here: ${link}`.slice(0, 1000) : base
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed')
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) return errorResponse(503, 'service_unavailable')
  if (!ENC_KEY) return errorResponse(503, 'vault_not_configured', 'CREDENTIALS_ENCRYPTION_KEY is not configured on the server.')

  const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!token) return errorResponse(401, 'unauthorized')

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) return errorResponse(401, 'unauthorized')

  let raw: unknown
  try { raw = await req.json() } catch { return errorResponse(400, 'invalid_json') }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return errorResponse(400, 'invalid_request')

  const { tenant_id, review_request_id } = parsed.data
  const { data: membership, error: memErr } = await supabase
    .from('business_members').select('role')
    .eq('tenant_id', tenant_id).eq('user_id', userData.user.id).eq('status', 'active').maybeSingle()
  if (memErr) return errorResponse(500, 'membership_check_failed')
  if (!membership) return errorResponse(403, 'forbidden')
  if (!['owner', 'admin', 'manager'].includes(String(membership.role))) return errorResponse(403, 'forbidden', 'Manager role required')

  const admin = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data: row, error: rowErr } = await admin.from('review_requests')
    .select('id, tenant_id, contact_id, customer_name, customer_phone, channel, review_link_type, review_url, message_template, status, public_token')
    .eq('id', review_request_id).eq('tenant_id', tenant_id)
    .maybeSingle<{
      id: string; tenant_id: string; contact_id: string | null; customer_name: string | null; customer_phone: string | null;
      channel: string; review_link_type: string | null; review_url: string | null; message_template: string | null;
      status: string; public_token: string | null
    }>()
  if (rowErr) return errorResponse(500, 'lookup_failed')
  if (!row) return errorResponse(404, 'not_found')
  if (row.channel !== 'whatsapp') return errorResponse(422, 'unsupported_channel', 'Only WhatsApp review requests can be sent by this action.')
  if (row.status === 'sent') return errorResponse(409, 'already_sent', 'This review request was already sent.')
  if (row.status !== 'approved') return errorResponse(422, 'approval_required', 'Review request must be approved before sending.')
  if (!row.customer_phone?.trim()) return errorResponse(422, 'missing_phone', 'Customer phone number is missing.')

  const accessToken = await getVaultSecret(SUPABASE_URL, SERVICE_ROLE_KEY, tenant_id, 'whatsapp', 'WHATSAPP_ACCESS_TOKEN', ENC_KEY)
  const phoneNumberId = await getVaultSecret(SUPABASE_URL, SERVICE_ROLE_KEY, tenant_id, 'whatsapp', 'WHATSAPP_PHONE_NUMBER_ID', ENC_KEY)
  if (!accessToken || !phoneNumberId) {
    return errorResponse(503, 'whatsapp_not_configured', 'WhatsApp is not configured. Save WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in Secure Direct Connect.')
  }

  const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/$/, '') || 'https://rococo-florentine-8dbe2c.netlify.app'
  const content = buildMessage(row, origin)
  const idempotencyKey = `review-request-${row.id}`

  try {
    const result = await sendWhatsAppMessage({
      tenantId: tenant_id,
      contactId: row.contact_id ?? row.id,
      to: row.customer_phone,
      content,
      accessToken,
      phoneNumberId,
      state: { sessionOpen: false, optedOut: false, consented: false },
      idempotencyKey,
      templateName: null,
      templateLanguage: null,
    })

    await admin.from('review_requests').update({
      status: 'sent', sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
    }).eq('id', row.id).eq('tenant_id', tenant_id)

    return jsonResponse({ ok: true, status: 'sent', provider: result.provider, provider_message_id: result.providerMessageId, mode: result.mode })
  } catch (e) {
    const message = e instanceof WhatsAppSendError ? e.message : 'WhatsApp send failed'
    const code = e instanceof WhatsAppSendError ? e.code : 'provider_error'
    await admin.from('review_requests').update({
      status: 'failed', last_error: `${code}: ${message}`.slice(0, 500), updated_at: new Date().toISOString(),
    }).eq('id', row.id).eq('tenant_id', tenant_id)
    const status = e instanceof WhatsAppSendError ? (e.code === 'template_required' || e.code === 'consent_required' || e.code === 'opted_out' || e.code === 'invalid_recipient' ? 422 : 502) : 502
    return errorResponse(status, code, message)
  }
})
