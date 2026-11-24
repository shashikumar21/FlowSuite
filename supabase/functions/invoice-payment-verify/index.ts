// Verifies Razorpay checkout signature and records the payment on the invoice.
// Deploy with verify_jwt=true. Idempotent: the webhook may record the same order
// first; both paths converge on the same service-role RPC.

import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '../_shared/ai/store.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/http.ts'
import { verifyPaymentSignature } from '../_shared/billing.ts'
import { getTenantRazorpayKeys } from '../_shared/billingTenant.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ENC_KEY = Deno.env.get('CREDENTIALS_ENCRYPTION_KEY') ?? ''

const schema = z.object({
  tenant_id: z.string().uuid(),
  order_id: z.string().min(1).max(120),
  payment_id: z.string().min(1).max(100),
  signature: z.string().min(1).max(200),
})

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
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY || !ENC_KEY) {
    return errorResponse(503, 'service_unavailable')
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
    return errorResponse(403, 'forbidden', 'Manager access is required to collect payments.')
  }

  const admin = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const orderResult = await admin
    .from('invoice_payment_orders')
    .select('id, tenant_id, invoice_id, amount_paise, status')
    .eq('provider_order_id', order_id)
    .maybeSingle<InvoiceOrder>()
  if (orderResult.error) return errorResponse(500, 'order_lookup_failed')
  if (!orderResult.data) return errorResponse(404, 'order_not_found')
  if (orderResult.data.tenant_id !== tenant_id) return errorResponse(403, 'forbidden')

  const keys = await getTenantRazorpayKeys(SUPABASE_URL, SERVICE_ROLE_KEY, ENC_KEY, orderResult.data.tenant_id)
  if (!keys) return errorResponse(503, 'razorpay_not_configured')

  const valid = await verifyPaymentSignature(keys.keySecret, order_id, payment_id, signature)
  if (!valid) return errorResponse(400, 'invalid_signature', 'Payment signature verification failed.')

  const recorded = await admin.rpc('payments_service_record_online_payment', {
    p_tenant: tenant_id,
    p_provider_order_id: order_id,
    p_provider_payment_id: payment_id,
    p_amount_paise: orderResult.data.amount_paise,
  })
  if (recorded.error) {
    return errorResponse(500, 'payment_record_failed', 'The payment could not be recorded. It will be confirmed by the signed webhook.')
  }

  return jsonResponse({
    ok: true,
    status: 'paid',
    order_id,
    payment_id,
    invoice_id: orderResult.data.invoice_id,
  })
})
