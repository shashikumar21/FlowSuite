import { describe, expect, it } from 'vitest'
import { buildReceipt, fromPaise, periodEndIso, planAmountPaise, toPaise } from './billing'

describe('toPaise', () => {
  it('converts whole and fractional rupees to integer paise', () => {
    expect(toPaise(999)).toBe(99900)
    expect(toPaise(2499.5)).toBe(249950)
    expect(toPaise(0.01)).toBe(1)
  })

  it('rejects invalid and zero amounts so no free order can be created', () => {
    expect(() => toPaise(0)).toThrow()
    expect(() => toPaise(-1)).toThrow()
    expect(() => toPaise(Number.NaN)).toThrow()
    expect(() => toPaise(Number.POSITIVE_INFINITY)).toThrow()
  })
})

describe('fromPaise', () => {
  it('converts paise back to rupees', () => {
    expect(fromPaise(99900)).toBe(999)
    expect(fromPaise(1)).toBe(0.01)
  })

  it('rejects non-integer values', () => {
    expect(() => fromPaise(10.5)).toThrow()
  })
})

describe('planAmountPaise', () => {
  const plan = { price_monthly: 999, price_yearly: 9990 }

  it('uses the monthly price by default', () => {
    expect(planAmountPaise(plan, 'monthly')).toBe(99900)
  })

  it('uses the yearly price when requested', () => {
    expect(planAmountPaise(plan, 'yearly')).toBe(999000)
  })

  it('rejects custom-priced plans with a zero amount', () => {
    expect(() => planAmountPaise({ price_monthly: 0, price_yearly: 0 }, 'monthly')).toThrow()
  })
})

describe('buildReceipt', () => {
  it('stays within the Razorpay 40 character limit', () => {
    const receipt = buildReceipt('09902c67-e585-427c-98be-df91c211e864', '1732400000000')
    expect(receipt.length).toBeLessThanOrEqual(40)
    expect(receipt).toMatch(/^fs_[a-zA-Z0-9]+_/)
  })
})

describe('periodEndIso', () => {
  it('adds one month for monthly billing', () => {
    expect(periodEndIso(new Date('2026-01-15T10:00:00.000Z'), 'monthly')).toBe('2026-02-15T10:00:00.000Z')
  })

  it('adds one year for yearly billing', () => {
    expect(periodEndIso(new Date('2026-01-15T10:00:00.000Z'), 'yearly')).toBe('2027-01-15T10:00:00.000Z')
  })
})
