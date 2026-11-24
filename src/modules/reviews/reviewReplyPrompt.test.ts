import { describe, expect, it } from 'vitest'
import { fallbackReviewReply, screenReviewFeedback } from './reviewReplyPrompt'

describe('review reply prompt hygiene', () => {
  it('allows ordinary non-clinical review text', () => {
    expect(screenReviewFeedback('Loved the friendly team and quick service.')).toEqual({
      safe: true,
      text: 'Loved the friendly team and quick service.',
    })
  })

  it('allows empty feedback', () => {
    expect(screenReviewFeedback(null)).toEqual({ safe: true, text: '' })
  })

  it('blocks contact details from reaching the AI provider', () => {
    expect(screenReviewFeedback('Reply to owner@example.com').safe).toBe(false)
    expect(screenReviewFeedback('Call me on +91 96031 48979 please').safe).toBe(false)
  })

  it('blocks clinical or patient-related text from reaching the AI provider', () => {
    expect(screenReviewFeedback('The dentist explained my treatment clearly').safe).toBe(false)
    expect(screenReviewFeedback('My tooth still hurts after the implant').safe).toBe(false)
  })

  it('uses rating-only fallback copy', () => {
    expect(fallbackReviewReply('Demo Clinic', 5)).toContain('Demo Clinic')
    expect(fallbackReviewReply('Demo Clinic', 2)).toContain('take it seriously')
  })
})
