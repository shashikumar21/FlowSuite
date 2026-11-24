import { requireSupabase } from '@/integrations/supabase/client'
import {
  createInvoicePaymentResultSchema,
  gatewayStatusSchema,
  razorpayCredentialSchema,
  verifyInvoicePaymentResultSchema,
  RAZORPAY_SECRET_NAMES,
  type CreateInvoicePaymentResult,
  type GatewayStatus,
  type RazorpayCredentials,
  type VerifyInvoicePaymentResult,
} from './gateway'

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

export async function fetchGatewayStatus(tenantId: string): Promise<GatewayStatus> {
  const { data, error } = await requireSupabase()
    .rpc('payments_gateway_status' as never, { p_tenant: tenantId } as never)
  if (error) throw error
  return gatewayStatusSchema.parse(data)
}

export async function createInvoicePayment(input: {
  tenantId: string
  invoiceId: string
}): Promise<CreateInvoicePaymentResult> {
  try {
    const { data, error } = await requireSupabase().functions.invoke('invoice-payment-create', {
      body: { tenant_id: input.tenantId, invoice_id: input.invoiceId },
    })
    if (error) throw error
    return createInvoicePaymentResultSchema.parse(data)
  } catch (error) {
    throw await readFunctionError(error)
  }
}

export async function verifyInvoicePayment(input: {
  tenantId: string
  orderId: string
  paymentId: string
  signature: string
}): Promise<VerifyInvoicePaymentResult> {
  try {
    const { data, error } = await requireSupabase().functions.invoke('invoice-payment-verify', {
      body: {
        tenant_id: input.tenantId,
        order_id: input.orderId,
        payment_id: input.paymentId,
        signature: input.signature,
      },
    })
    if (error) throw error
    return verifyInvoicePaymentResultSchema.parse(data)
  } catch (error) {
    throw await readFunctionError(error)
  }
}

/** Writes the three tenant-owned keys through the encrypted vault function. */
export async function saveRazorpayCredentials(input: RazorpayCredentials & { tenantId: string }): Promise<void> {
  const values = razorpayCredentialSchema.parse(input)
  const secrets = [values.keyId, values.keySecret, values.webhookSecret]
  for (let i = 0; i < RAZORPAY_SECRET_NAMES.length; i += 1) {
    const { error } = await requireSupabase().functions.invoke('integrations-vault-save', {
      body: {
        tenant_id: input.tenantId,
        provider: 'razorpay',
        secret_name: RAZORPAY_SECRET_NAMES[i],
        secret_value: secrets[i],
      },
    })
    if (error) throw await readFunctionError(error)
  }
}
