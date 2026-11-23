import { z } from 'zod'

export const planSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  price_monthly: z.number().nonnegative(),
  price_yearly: z.number().nonnegative(),
  limits: z.record(z.string(), z.unknown()),
  features: z.record(z.string(), z.unknown()),
})

export const subscriptionSummarySchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  provider: z.string(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  plan: planSummarySchema,
})

export const billingOverviewSchema = z.object({
  plans: z.array(planSummarySchema),
  subscription: subscriptionSummarySchema.nullable(),
  entitlements: z.record(z.string(), z.boolean()),
  limits: z.record(z.string(), z.number()),
})

export const createOrderRequestSchema = z.object({
  tenant_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  billing_cycle: z.enum(['monthly', 'yearly']),
})

export const createOrderResultSchema = z.object({
  ok: z.literal(true),
  order_id: z.string().min(1),
  key_id: z.string().min(1),
  amount_paise: z.number().int().positive(),
  currency: z.string().min(3),
  receipt: z.string(),
  plan_name: z.string(),
  billing_cycle: z.enum(['monthly', 'yearly']),
})

export const verifyPaymentRequestSchema = z.object({
  tenant_id: z.string().uuid(),
  order_id: z.string().min(1),
  payment_id: z.string().min(1),
  signature: z.string().min(1),
})

export const verifyPaymentResultSchema = z.object({
  ok: z.literal(true),
  status: z.literal('active'),
  order_id: z.string(),
  payment_id: z.string(),
})
