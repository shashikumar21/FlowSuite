// Razorpay webhook: HMAC-verified, idempotent, activates paid subscriptions.
// Fails closed without RAZORPAY_WEBHOOK_SECRET. No client authentication here —
// the signed body is the only trust input.

import { z } from 'zod'
import { createServiceClient } from '../_shared/ai/store.ts'
import { periodEndIso } from '../../../src/lib/billing.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/http.ts'
import { sha256Hex, verifyWebhookSignature } from '../_shared/billing.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const WEBHOOK_SECRET = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') ?? ''

const payloadSchema = z.object({
  event: z.string().min(1).max(120),
  payload: z.object({
    payment: z.object({
      entity: z.object({ id: z.string().optional(), order_id: z.string().optional() }).optional(),
    }).optional(),
    order: z.object({
      entity: z.object({ id: z.string().optional() }).optional(),
    }).optional(),
  }).optional(),
}).passthrough()

type BillingOrder = {
  id: string
  tenant_id: string
  plan_id: string
  billing_cycle: 'monthly' | 'yearly'
  status: string
}

const PAID_EVENTS = new Set(['payment.captured', 'order.paid'])
const FAILED_EVENTS = new Set(['payment.failed'])

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed')
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return errorResponse(503, 'service_unavailable')
  if (!WEBHOOK_SECRET.trim()) {
    return errorResponse(503, 'billing_not_configured', 'Webhook secret is not configured on the server.')
  }

  const rawBody = await req.text()
  const signature = req.headers.get('x-razorpay-signature')
  const valid = await verifyWebhookSignature(WEBHOOK_SECRET, rawBody, signature)
  if (!valid) return errorResponse(401, 'invalid_signature')

  let parsed: z.infer<typeof payloadSchema>
  try {
    parsed = payloadSchema.parse(JSON.parse(rawBody))
  } catch {
    return errorResponse(400, 'invalid_payload')
  }

  const eventId = (req.headers.get('x-razorpay-event-id') ?? '').trim() || await sha256Hex(rawBody)
  const admin = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const recorded = await admin.rpc('billing_service_record_webhook_event', {
    p_provider_event_id: eventId.slice(0, 200),
    p_event_type: parsed.event,
    p_payload: parsed,
  })
  if (recorded.error) return errorResponse(500, 'event_record_failed')
  if (recorded.data === false) return jsonResponse({ ok: true, duplicate: true })

  const finish = (status: string, error: string | null) =>
    admin.rpc('billing_service_finish_webhook_event', {
      p_provider_event_id: eventId.slice(0, 200), p_status: status, p_error: error,
    })

  try {
    const paymentId = parsed.payload?.payment?.entity?.id ?? ''
    const orderId = parsed.payload?.payment?.entity?.order_id ?? parsed.payload?.order?.entity?.id ?? ''

    if (!orderId) {
      await finish('ignored', 'no_order_reference')
      return jsonResponse({ ok: true, ignored: true, reason: 'no_order_reference' })
    }

    const orderResult = await admin
      .from('billing_orders')
      .select('id, tenant_id, plan_id, billing_cycle, status')
      .eq('provider_order_id', orderId)
      .maybeSingle<BillingOrder>()
    if (orderResult.error) throw new Error('order_lookup_failed')
    if (!orderResult.data) {
      await finish('ignored', 'order_not_found')
      return jsonResponse({ ok: true, ignored: true, reason: 'order_not_found' })
    }

    if (FAILED_EVENTS.has(parsed.event)) {
      const failed = await admin.rpc('billing_service_mark_order_failed', {
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

    const now = new Date()
    const activation = await admin.rpc('billing_service_activate_subscription', {
      p_tenant: orderResult.data.tenant_id,
      p_plan_id: orderResult.data.plan_id,
      p_provider_order_id: orderId,
      p_provider_payment_id: paymentId || orderId,
      p_period_start: now.toISOString(),
      p_period_end: periodEndIso(now, orderResult.data.billing_cycle),
    })
    if (activation.error) throw new Error(activation.error.message)

    await finish('processed', null)
    return jsonResponse({ ok: true, status: 'active', order_id: orderId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'webhook_processing_failed'
    await finish('failed', message)
    return errorResponse(500, 'webhook_processing_failed', message)
  }
})
