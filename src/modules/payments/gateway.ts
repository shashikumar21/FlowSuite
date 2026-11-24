import { z } from 'zod'
import { buildReceipt, toPaise } from '@/lib/billing'

/** Per-tenant Razorpay secrets live in the encrypted integration vault. */
export const RAZORPAY_SECRET_NAMES = [
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
] as const

export const gatewayStatusSchema = z.object({
  configured: z.boolean(),
  keys_configured: z.boolean(),
  webhook_configured: z.boolean(),
})
export type GatewayStatus = z.infer<typeof gatewayStatusSchema>

export const createInvoicePaymentResultSchema = z.object({
  ok: z.literal(true),
  order_id: z.string().min(1),
  key_id: z.string().min(1),
  amount_paise: z.number().int().positive(),
  currency: z.literal('INR'),
  receipt: z.string().min(1).max(40),
  invoice_id: z.string().uuid(),
})
export type CreateInvoicePaymentResult = z.infer<typeof createInvoicePaymentResultSchema>

export const verifyInvoicePaymentResultSchema = z.object({
  ok: z.literal(true),
  status: z.literal('paid'),
  order_id: z.string().min(1),
  payment_id: z.string().min(1),
  invoice_id: z.string().uuid(),
})
export type VerifyInvoicePaymentResult = z.infer<typeof verifyInvoicePaymentResultSchema>

export const razorpayCredentialSchema = z.object({
  keyId: z.string().trim().min(1, 'Key ID is required').max(200),
  keySecret: z.string().min(1, 'Key secret is required').max(2000),
  webhookSecret: z.string().min(1, 'Webhook secret is required').max(2000),
})
export type RazorpayCredentials = z.infer<typeof razorpayCredentialSchema>

/** Razorpay receipts must be unique and at most 40 characters. */
export function invoiceReceipt(tenantId: string, invoiceId: string): string {
  return buildReceipt(tenantId, invoiceId)
}

/** Converts the invoice balance into integer paise; throws when nothing is due. */
export function invoiceBalancePaise(total: number, paid: number): number {
  return toPaise(Math.max(Number(total) - Number(paid), 0))
}
