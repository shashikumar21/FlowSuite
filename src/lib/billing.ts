/**
 * Pure billing helpers shared by the browser and Edge Functions.
 * No secrets, provider calls or environment access here.
 */

export type BillingCycle = 'monthly' | 'yearly'

/** Converts a rupee amount from the database into integer paise. */
export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees) || rupees < 0) throw new Error('Invalid rupee amount')
  const paise = Math.round(rupees * 100)
  if (!Number.isSafeInteger(paise) || paise <= 0) throw new Error('Invalid paise amount')
  return paise
}

export function fromPaise(paise: number): number {
  if (!Number.isSafeInteger(paise) || paise < 0) throw new Error('Invalid paise amount')
  return paise / 100
}

export function planAmountPaise(
  plan: { price_monthly: number; price_yearly: number },
  cycle: BillingCycle,
): number {
  return toPaise(cycle === 'yearly' ? plan.price_yearly : plan.price_monthly)
}

/** Razorpay receipts must be unique and at most 40 characters. */
export function buildReceipt(tenantId: string, suffix: string): string {
  const tenant = tenantId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
  const tail = suffix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20)
  return `fs_${tenant}_${tail}`.slice(0, 40)
}

/** UTC period end for a paid plan, used by the webhook and verify function. */
export function periodEndIso(start: Date, cycle: BillingCycle): string {
  const end = new Date(start.getTime())
  if (cycle === 'yearly') end.setUTCFullYear(end.getUTCFullYear() + 1)
  else end.setUTCMonth(end.getUTCMonth() + 1)
  return end.toISOString()
}
