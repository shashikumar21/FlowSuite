import { describe, expect, it } from 'vitest'
import { constantTimeEqual } from '../../supabase/functions/_shared/billing'

describe('constantTimeEqual (webhook signature comparison)', () => {
  it('accepts identical hex signatures regardless of case or sha256 prefix', () => {
    const value = 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3'
    expect(constantTimeEqual(value, value)).toBe(true)
    expect(constantTimeEqual(value.toUpperCase(), value)).toBe(true)
    expect(constantTimeEqual(`sha256=${value}`, value)).toBe(true)
  })

  it('rejects different signatures and different lengths', () => {
    expect(constantTimeEqual('abc123', 'abc124')).toBe(false)
    expect(constantTimeEqual('abc123', 'abc1234')).toBe(false)
    expect(constantTimeEqual('', '')).toBe(true)
  })
})
