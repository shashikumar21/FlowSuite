// Creates a Razorpay order for an authenticated tenant's invoice.
// Deploy with verify_jwt=true. The tenant's own keys come from the encrypted
// vault. No payment is captured here; only a verified signature/webhook can
// record a payment through the service-role RPC.

import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '../_shared/ai/store.ts'
import { buildReceipt, toPaise } from '../../../src/lib/billing.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/http.ts'
import { RazorpayApiError, razorpayRequest } from '../_shared/billing.ts'
import { getTenantRazorpayKeys } from '../_shared/billingTenant.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ENC_KEY = Deno.env.get('CREDENTIALS_ENCRYPTION_KEY') ?? ''

const schema = z.object({
  tenant_id: z.string().uuid(),
  invoice_id: z.string().uuid(),
})

const orderResponseSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.string().min(3),
  receipt: z.string().optional(),
})

type InvoiceRow = {
  id: string
  tenant_id: string
  status: string
  currency: string
  total_amount: number
  amount_paid: number
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

  const { tenant_id, invoice_id } = parsed.data
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
  const invoiceResult = await admin
    .from('invoices')
    .select('id, tenant_id, status, currency, total_amount, amount_paid')
    .eq('id', invoice_id)
    .eq('tenant_id', tenant_id)
    .maybeSingle<InvoiceRow>()
  if (invoiceResult.error) return errorResponse(500, 'invoice_lookup_failed')
  if (!invoiceResult.data) return errorResponse(404, 'invoice_not_found')
  const invoice = invoiceResult.data
  if (invoice.status === 'void' || invoice.status === 'paid') {
    return errorResponse(422, 'invoice_not_payable', 'This invoice has no balance to collect.')
  }

  let amountPaise: number
  try {
    amountPaise = toPaise(Number(invoice.total_amount) - Number(invoice.amount_paid))
  } catch {
    return errorResponse(422, 'invoice_not_payable', 'This invoice has no balance to collect.')
  }
  if (invoice.currency.toUpperCase() !== 'INR') {
    return errorResponse(422, 'unsupported_currency', 'Online collection currently supports INR only.')
  }

  const keys = await getTenantRazorpayKeys(SUPABASE_URL, SERVICE_ROLE_KEY, ENC_KEY, tenant_id)
  if (!keys) {
    return errorResponse(503, 'razorpay_not_configured', 'Online collection is not configured. Save your Razorpay keys under Payments → Connect Razorpay.')
  }

  const receipt = buildReceipt(tenant_id, invoice_id)
  let order
  try {
    const response = await razorpayRequest<unknown>('/orders', keys.keyId, keys.keySecret, {
      method: 'POST',
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt,
        notes: { tenant_id, invoice_id, purpose: 'invoice_payment' },
      }),
    })
    order = orderResponseSchema.parse(response)
  } catch (error) {
    const message = error instanceof RazorpayApiError
      ? error.message
      : 'Could not create a payment order';
    return errorResponse(502, 'order_creation_failed', message)
  }
  if (order.amount !== amountPaise || order.currency.toUpperCase() !== 'INR') {
    return errorResponse(502, 'order_creation_failed', 'Unexpected Razorpay order response')
  }

  const recorded = await admin.rpc('payments_service_create_invoice_order', {
    p_tenant: tenant_id,
    p_invoice: invoice_id,
    p_provider_order_id: order.id,
    p_amount_paise: amountPaise,
    p_currency: 'INR',
    p_receipt: order.receipt ?? receipt,
    p_created_by: userData.user.id,
  })
  if (recorded.error) {
    return errorResponse(500, 'order_record_failed', 'The payment order was created but could not be recorded. Contact support before paying.')
  }

  return jsonResponse({
    ok: true,
    order_id: order.id,
    key_id: keys.keyId,
    amount_paise: amountPaise,
    currency: 'INR',
    receipt: order.receipt ?? receipt,
    invoice_id,
  })
})
