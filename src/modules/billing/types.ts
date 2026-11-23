export type BillingCycle = 'monthly' | 'yearly'

export type PlanSummary = {
  id: string
  name: string
  description: string | null
  price_monthly: number
  price_yearly: number
  limits: Record<string, unknown>
  features: Record<string, unknown>
}

export type SubscriptionSummary = {
  id: string
  status: string
  provider: string
  period_start: string | null
  period_end: string | null
  plan: PlanSummary
}

export type BillingOverview = {
  plans: PlanSummary[]
  subscription: SubscriptionSummary | null
  entitlements: Record<string, boolean>
  limits: Record<string, number>
}

export type CreateOrderResult = {
  ok: boolean
  order_id: string
  key_id: string
  amount_paise: number
  currency: string
  receipt: string
  plan_name: string
  billing_cycle: BillingCycle
}
