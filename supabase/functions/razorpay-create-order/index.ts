// Creates a Razorpay order for an authenticated tenant manager+.
// Keys stay server-side. No payment is captured here and no subscription is
// activated here: that only happens after a verified payment/webhook.

import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '../_shared/ai/store.ts'
import { buildReceipt, planAmountPaise } from '../../../src/lib/billing.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/http.ts'
import { RazorpayApiError, razorpayRequest } from '../_shared/billing.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') ?? ''
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') ?? ''

const schema = z.object({
  tenant_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  billing_cycle: z.enum(['monthly', 'yearly']),
})

const orderResponseSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.string().min(3),
  receipt: z.string().optional(),
})

type PlanRow = {
  id: string
  name: string
  price_monthly: number
  price_yearly: number
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed')
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) return errorResponse(503, 'service_unavailable')
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
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

  const { tenant_id, plan_id, billing_cycle } = parsed.data
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
  const planResult = await admin
    .from('plans')
    .select('id, name, price_monthly, price_yearly')
    .eq('id', plan_id)
    .eq('active', true)
    .maybeSingle<PlanRow>()
  if (planResult.error) return errorResponse(500, 'plan_lookup_failed')
  if (!planResult.data) return errorResponse(404, 'plan_not_found')

  let amountPaise: number
  try {
    amountPaise = planAmountPaise(planResult.data, billing_cycle)
  } catch {
    return errorResponse(422, 'plan_not_purchasable', 'This plan has no online price. Contact sales instead.')
  }

  const receipt = buildReceipt(tenant_id, Date.now().toString())
  let order
  try {
    const response = await razorpayRequest<unknown>('/orders', RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, {
      method: 'POST',
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt,
        notes: { tenant_id, plan_id, plan_name: planResult.data.name, billing_cycle },
      }),
    })
    order = orderResponseSchema.parse(response)
  } catch (error) {
    const message = error instanceof RazorpayApiError
      ? error.message
      : error instanceof z.ZodError
        ? 'Unexpected Razorpay order response'
        : 'Could not create a payment order';
    return errorResponse(502, 'order_creation_failed', message)
  }

  const recordError = await admin.rpc('billing_service_record_order', {
    p_tenant: tenant_id,
    p_plan_id: plan_id,
    p_provider_order_id: order.id,
    p_amount_paise: order.amount,
    p_currency: order.currency,
    p_billing_cycle: billing_cycle,
    p_created_by: userData.user.id,
  })
  if (recordError.error) {
    return errorResponse(500, 'order_record_failed', 'The payment order was created but could not be recorded. Contact support before paying.')
  }

  return jsonResponse({
    ok: true,
    order_id: order.id,
    key_id: RAZORPAY_KEY_ID,
    amount_paise: order.amount,
    currency: order.currency,
    receipt: order.receipt ?? receipt,
    plan_name: planResult.data.name,
    billing_cycle,
  })
})
