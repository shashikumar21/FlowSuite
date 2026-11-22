import { describe, expect, it } from 'vitest'
import { buildGrowthSummary, canManageGrowth, ratingLabel, statusVariant } from './utils'

describe('Growth presentation helpers', () => {
  it('derives counts only from supplied tenant rows', () => {
    const summary = buildGrowthSummary({
      campaigns: [{ status: 'active' }, { status: 'draft' }],
      creatives: [{}, {}],
      websites: [{}],
      submissions: [{ status: 'new' }, { status: 'reviewed' }],
      reviews: [{ status: 'new' }, { status: 'responded' }],
      feedback: [{}],
    })
    expect(summary).toEqual({
      campaigns: 2,
      activeCampaigns: 1,
      creatives: 2,
      websites: 1,
      submissions: 2,
      newSubmissions: 1,
      reviews: 2,
      newReviews: 1,
      feedback: 1,
    })
  })

  it('uses honest zeros for empty data', () => {
    const summary = buildGrowthSummary({
      campaigns: [], creatives: [], websites: [], submissions: [], reviews: [], feedback: [],
    })
    expect(Object.values(summary).every((value) => value === 0)).toBe(true)
  })

  it('gates destructive actions to owner and admin in the UI only', () => {
    expect(canManageGrowth('owner')).toBe(true)
    expect(canManageGrowth('admin')).toBe(true)
    expect(canManageGrowth('manager')).toBe(false)
    expect(canManageGrowth('employee')).toBe(false)
    expect(canManageGrowth(undefined)).toBe(false)
  })

  it('formats ratings and status colours without inventing scores', () => {
    expect(ratingLabel(4)).toBe('4/5')
    expect(statusVariant('active')).toBe('success')
    expect(statusVariant('new')).toBe('warning')
    expect(statusVariant('draft')).toBe('neutral')
  })
})
