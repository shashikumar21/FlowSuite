import { requireSupabase } from '@/integrations/supabase/client'
import {
  adminAssignPlanSchema,
  billingOverviewSchema,
  billingSettingsSchema,
  billingUsageSchema,
  createOrderResultSchema,
  setBillingEnforcementSchema,
  verifyPaymentResultSchema,
} from './schemas'
import type {
  BillingCycle,
  BillingOverview,
  BillingSettings,
  BillingUsage,
  CreateOrderResult,
} from './types'

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

export async function fetchBillingUsage(tenantId: string): Promise<BillingUsage> {
  const { data, error } = await requireSupabase().rpc('billing_get_usage', {
    p_tenant: tenantId,
  })
  if (error) throw error
  return billingUsageSchema.parse(data)
}

export async function fetchBillingSettings(): Promise<BillingSettings> {
  const { data, error } = await requireSupabase().rpc('billing_get_settings', {})
  if (error) throw error
  return billingSettingsSchema.parse(data)
}

export async function assignTenantPlan(input: {
  tenantId: string
  planId: string
  reason: string | null
}): Promise<void> {
  const payload = adminAssignPlanSchema.parse({
    tenant_id: input.tenantId,
    plan_id: input.planId,
    reason: input.reason,
  })
  const { error } = await requireSupabase().rpc('admin_set_tenant_plan', {
    p_tenant: payload.tenant_id,
    p_plan: payload.plan_id,
    p_reason: payload.reason,
  })
  if (error) throw error
}

export async function setBillingEnforcement(enabled: boolean): Promise<BillingSettings> {
  const payload = setBillingEnforcementSchema.parse({ enabled })
  const { data, error } = await requireSupabase().rpc('admin_set_billing_enforcement', {
    p_enabled: payload.enabled,
  })
  if (error) throw error
  return billingSettingsSchema.parse(data)
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
