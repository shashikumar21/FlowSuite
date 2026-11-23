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

export const billingUsageSchema = z.object({
  contacts: z.number().int().nonnegative(),
  employees: z.number().int().nonnegative(),
  branches: z.number().int().nonnegative(),
  messages: z.number().int().nonnegative(),
  workflow_runs: z.number().int().nonnegative(),
  ai_credits: z.number().int().nonnegative(),
  period_start: z.string(),
})

export const billingSettingsSchema = z.object({
  enforce_limits: z.boolean(),
  updated_at: z.string().nullable(),
})

export const adminAssignPlanSchema = z.object({
  tenant_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  reason: z.string().trim().max(500).nullable(),
})

export const setBillingEnforcementSchema = z.object({
  enabled: z.boolean(),
})
