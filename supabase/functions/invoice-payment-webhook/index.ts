// Razorpay webhook for tenant-owned invoice payments.
// Deploy with verify_jwt=false: the signed raw body is the only trust input.
// Each tenant has its own webhook secret in the encrypted vault; the tenant is
// identified only after a matching HMAC is found. No key value is logged.

import { z } from 'zod'
import { createServiceClient } from '../_shared/ai/store.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/http.ts'
import { sha256Hex, verifyWebhookSignature } from '../_shared/billing.ts'
import { listRazorpayWebhookSecrets } from '../_shared/billingTenant.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ENC_KEY = Deno.env.get('CREDENTIALS_ENCRYPTION_KEY') ?? ''

const payloadSchema = z.object({
  event: z.string().min(1).max(120),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string().optional(),
        order_id: z.string().optional(),
      }).optional(),
    }).optional(),
    order: z.object({
      entity: z.object({ id: z.string().optional() }).optional(),
    }).optional(),
  }).optional(),
}).passthrough()

const PAID_EVENTS = new Set(['payment.captured', 'order.paid'])
const FAILED_EVENTS = new Set(['payment.failed'])

type InvoiceOrder = {
  id: string
  tenant_id: string
  invoice_id: string
  amount_paise: number
  status: string
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed')
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENC_KEY) return errorResponse(503, 'service_unavailable')

  const rawBody = await req.text()
  const signature = req.headers.get('x-razorpay-signature')
  if (!signature?.trim()) return errorResponse(401, 'invalid_signature')

  let candidates: Array<{ tenantId: string; secret: string }>
  try {
    candidates = await listRazorpayWebhookSecrets(SUPABASE_URL, SERVICE_ROLE_KEY, ENC_KEY)
  } catch {
    return errorResponse(500, 'vault_lookup_failed')
  }
  if (candidates.length === 0) {
    return errorResponse(503, 'razorpay_not_configured', 'No tenant webhook secret is configured.')
  }

  let tenantId: string | null = null
  for (const candidate of candidates) {
    if (await verifyWebhookSignature(candidate.secret, rawBody, signature)) {
      tenantId = candidate.tenantId
      break
    }
  }
  if (!tenantId) return errorResponse(401, 'invalid_signature')

  let parsed: z.infer<typeof payloadSchema>
  try {
    parsed = payloadSchema.parse(JSON.parse(rawBody))
  } catch {
    return errorResponse(400, 'invalid_payload')
  }

  const eventId = ((req.headers.get('x-razorpay-event-id') ?? '').trim() || await sha256Hex(rawBody)).slice(0, 200)
  const admin = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const recorded = await admin.rpc('payments_service_record_invoice_webhook_event', {
    p_tenant: tenantId,
    p_provider_event_id: eventId,
    p_event_type: parsed.event,
    p_payload: parsed,
  })
  if (recorded.error) return errorResponse(500, 'event_record_failed')
  if (recorded.data === false) return jsonResponse({ ok: true, duplicate: true })

  const finish = (status: string, error: string | null) =>
    admin.rpc('payments_service_finish_invoice_webhook_event', {
      p_provider_event_id: eventId,
      p_status: status,
      p_error: error,
    })

  try {
    const paymentId = parsed.payload?.payment?.entity?.id ?? ''
    const orderId = parsed.payload?.payment?.entity?.order_id ?? parsed.payload?.order?.entity?.id ?? ''
    if (!orderId) {
      await finish('ignored', 'no_order_reference')
      return jsonResponse({ ok: true, ignored: true, reason: 'no_order_reference' })
    }

    const orderResult = await admin
      .from('invoice_payment_orders')
      .select('id, tenant_id, invoice_id, amount_paise, status')
      .eq('provider_order_id', orderId)
      .maybeSingle<InvoiceOrder>()
    if (orderResult.error) throw new Error('order_lookup_failed')
    if (!orderResult.data || orderResult.data.tenant_id !== tenantId) {
      await finish('ignored', 'order_not_found')
      return jsonResponse({ ok: true, ignored: true, reason: 'order_not_found' })
    }

    if (FAILED_EVENTS.has(parsed.event)) {
      const failed = await admin.rpc('payments_service_mark_invoice_order_failed', {
        p_provider_order_id: orderId,
        p_error: `payment_failed:${paymentId || 'unknown'}`,
      })
      if (failed.error) throw new Error('order_status_update_failed')
      await finish('processed', null)
      return jsonResponse({ ok: true, status: 'failed' })
    }

    if (!PAID_EVENTS.has(parsed.event)) {
      await finish('ignored', 'unsupported_event')
      return jsonResponse({ ok: true, ignored: true, reason: 'unsupported_event' })
    }

    // Amount comes from our own order row, never from the unverified payload.
    const applied = await admin.rpc('payments_service_record_online_payment', {
      p_tenant: tenantId,
      p_provider_order_id: orderId,
      p_provider_payment_id: paymentId || orderId,
      p_amount_paise: orderResult.data.amount_paise,
    })
    if (applied.error) throw new Error('payment_record_failed')

    await finish('processed', null)
    return jsonResponse({ ok: true, status: 'paid', order_id: orderId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'webhook_processing_failed'
    await finish('failed', message)
    return errorResponse(500, 'webhook_processing_failed', message)
  }
})
