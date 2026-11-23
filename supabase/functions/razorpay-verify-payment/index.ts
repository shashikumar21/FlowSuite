// Verifies Razorpay checkout payment signature and activates the subscription.
// Idempotent: the webhook may activate the same order first; both paths converge
// on the same service-role RPC.

import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '../_shared/ai/store.ts'
import { periodEndIso } from '../../../src/lib/billing.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/http.ts'
import { verifyPaymentSignature } from '../_shared/billing.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') ?? ''

const schema = z.object({
  tenant_id: z.string().uuid(),
  order_id: z.string().min(1).max(120),
  payment_id: z.string().min(1).max(120),
  signature: z.string().min(1).max(200),
})

type BillingOrder = {
  id: string
  tenant_id: string
  plan_id: string
  billing_cycle: 'monthly' | 'yearly'
  status: string
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed')
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) return errorResponse(503, 'service_unavailable')
  if (!RAZORPAY_KEY_SECRET) {
    return errorResponse(503, 'billing_not_configured', 'Razorpay is not configured on the server yet. Payments are disabled.')
  }

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

  const { tenant_id, order_id, payment_id, signature } = parsed.data
  const membership = await supabase
    .from('business_members')
    .select('role')
    .eq('tenant_id', tenant_id)
    .eq('user_id', userData.user.id)
    .eq('status', 'active')
    .maybeSingle<{ role: string }>()
  if (membership.error) return errorResponse(500, 'membership_check_failed')
  if (!membership.data) return errorResponse(403, 'forbidden')
  if (!['owner', 'admin', 'manager'].includes(membership.data.role)) {
    return errorResponse(403, 'forbidden', 'Manager access is required to change the subscription.')
  }

  const admin = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const orderResult = await admin
    .from('billing_orders')
    .select('id, tenant_id, plan_id, billing_cycle, status')
    .eq('provider_order_id', order_id)
    .maybeSingle<BillingOrder>()
  if (orderResult.error) return errorResponse(500, 'order_lookup_failed')
  if (!orderResult.data) return errorResponse(404, 'order_not_found')
  if (orderResult.data.tenant_id !== tenant_id) return errorResponse(403, 'forbidden')

  const valid = await verifyPaymentSignature(RAZORPAY_KEY_SECRET, order_id, payment_id, signature)
  if (!valid) return errorResponse(400, 'invalid_signature', 'Payment signature verification failed.')

  const now = new Date()
  const activation = await admin.rpc('billing_service_activate_subscription', {
    p_tenant: tenant_id,
    p_plan_id: orderResult.data.plan_id,
    p_provider_order_id: order_id,
    p_provider_payment_id: payment_id,
    p_period_start: now.toISOString(),
    p_period_end: periodEndIso(now, orderResult.data.billing_cycle),
  })
  if (activation.error) return errorResponse(500, 'activation_failed', activation.error.message)

  return jsonResponse({ ok: true, status: 'active', order_id, payment_id })
})
