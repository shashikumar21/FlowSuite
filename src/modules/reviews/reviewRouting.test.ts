import { describe, expect, it } from 'vitest'
import { reviewSubmitRoute, safeReviewUrl } from './reviewRouting'

const GOOGLE = 'https://www.google.com/maps/reviews/data=abc'

describe('review submit routing', () => {
  it('keeps 1-3 stars on the private FlowSuite feedback view', () => {
    expect(reviewSubmitRoute(1, GOOGLE)).toBe('private_feedback')
    expect(reviewSubmitRoute(2, GOOGLE)).toBe('private_feedback')
    expect(reviewSubmitRoute(3, GOOGLE)).toBe('private_feedback')
  })

  it('keeps 4 stars on the FlowSuite suggestion screen', () => {
    expect(reviewSubmitRoute(4, GOOGLE)).toBe('suggestion')
  })

  it('opens Google only for 5 stars with a safe configured URL', () => {
    expect(reviewSubmitRoute(5, GOOGLE)).toBe('google_redirect')
    expect(reviewSubmitRoute(5, null)).toBe('suggestion')
    expect(reviewSubmitRoute(5, 'javascript:alert(1)')).toBe('suggestion')
  })

  it('allows only http(s) review URLs', () => {
    expect(safeReviewUrl(GOOGLE)).toBe(GOOGLE)
    expect(safeReviewUrl('http://maps.example.test/review')).toBe('http://maps.example.test/review')
    expect(safeReviewUrl('javascript:alert(1)')).toBeNull()
    expect(safeReviewUrl('data:text/html,x')).toBeNull()
    expect(safeReviewUrl('not a url')).toBeNull()
    expect(safeReviewUrl(null)).toBeNull()
  })
})
