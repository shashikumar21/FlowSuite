import { describe, expect, it } from 'vitest'
import { isGoogleReviewUrl, normalizeGoogleReviewUrl, reviewLinkHost } from './validation'

describe('Google review URL validation', () => {
  it('normalises blank values to null', () => {
    expect(normalizeGoogleReviewUrl('  ')).toBeNull()
    expect(normalizeGoogleReviewUrl(null)).toBeNull()
    expect(normalizeGoogleReviewUrl('  https://g.page/r/abc/review  ')).toBe('https://g.page/r/abc/review')
  })

  it('accepts Google-hosted HTTPS links', () => {
    expect(isGoogleReviewUrl('https://g.page/r/abc/review')).toBe(true)
    expect(isGoogleReviewUrl('https://www.google.com/maps/place/?q=place_id:abc')).toBe(true)
    expect(isGoogleReviewUrl('https://search.google.com/local/writereview?placeid=abc')).toBe(true)
    expect(isGoogleReviewUrl('https://maps.app.goo.gl/abc')).toBe(true)
  })

  it('rejects non-Google and insecure links', () => {
    expect(isGoogleReviewUrl('http://g.page/r/abc/review')).toBe(false)
    expect(isGoogleReviewUrl('https://evil.example.com/g.page/r/abc')).toBe(false)
    expect(isGoogleReviewUrl('https://user:pass@g.page/r/abc')).toBe(false)
    expect(isGoogleReviewUrl('https://g.page/r/abc#frag')).toBe(false)
    expect(isGoogleReviewUrl('not-a-url')).toBe(false)
    expect(isGoogleReviewUrl('')).toBe(false)
  })

  it('shows only the host for review links', () => {
    expect(reviewLinkHost(null)).toBe('FlowSuite')
    expect(reviewLinkHost('https://www.google.com/maps/place/?q=place_id:abc')).toBe('google.com')
    expect(reviewLinkHost('https://g.page/r/abc/review')).toBe('g.page')
    expect(reviewLinkHost('https://evil.example.com')).toBe('Custom link')
  })
})
