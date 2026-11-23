import { requireSupabase } from '@/integrations/supabase/client'
import { billingOverviewSchema, createOrderResultSchema, verifyPaymentResultSchema } from './schemas'
import type { BillingOverview, BillingCycle, CreateOrderResult } from './types'

async function readFunctionError(error: unknown): Promise<Error> {
  const context = (error as { context?: Response } | null)?.context
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json() as { error?: { message?: string } }
      if (body?.error?.message) return new Error(body.error.message)
    } catch {
      // Fall through to the original error.
    }
  }
  return error instanceof Error ? error : new Error('Payment request failed')
}

export async function fetchBillingOverview(tenantId: string): Promise<BillingOverview> {
  const { data, error } = await requireSupabase().rpc('billing_get_overview', {
    p_tenant: tenantId,
  })
  if (error) throw error
  return billingOverviewSchema.parse(data)
}

export async function createRazorpayOrder(input: {
  tenantId: string
  planId: string
  billingCycle: BillingCycle
}): Promise<CreateOrderResult> {
  try {
    const { data, error } = await requireSupabase().functions.invoke('razorpay-create-order', {
      body: {
        tenant_id: input.tenantId,
        plan_id: input.planId,
        billing_cycle: input.billingCycle,
      },
    })
    if (error) throw error
    return createOrderResultSchema.parse(data)
  } catch (error) {
    throw await readFunctionError(error)
  }
}

export async function verifyRazorpayPayment(input: {
  tenantId: string
  orderId: string
  paymentId: string
  signature: string
}): Promise<void> {
  try {
    const { data, error } = await requireSupabase().functions.invoke('razorpay-verify-payment', {
      body: {
        tenant_id: input.tenantId,
        order_id: input.orderId,
        payment_id: input.paymentId,
        signature: input.signature,
      },
    })
    if (error) throw error
    verifyPaymentResultSchema.parse(data)
  } catch (error) {
    throw await readFunctionError(error)
  }
}
