import { describe, expect, it } from 'vitest'
import {
  campaignSchema,
  creativeSchema,
  emptyCampaignForm,
  emptyCreativeForm,
  emptyFeedbackForm,
  emptyReviewForm,
  emptySiteForm,
  emptySubmissionForm,
  feedbackSchema,
  reviewSchema,
  reviewUpdateSchema,
  siteSchema,
  submissionSchema,
} from './schemas'

const validCampaign = () => ({
  ...emptyCampaignForm(),
  name: 'Festive offer',
  objective: 'Book appointments before the holiday.',
})

const validCreative = () => ({
  ...emptyCreativeForm('06a77082-53a2-4e9c-9c35-3214a76c9ba6'),
  name: 'WhatsApp invite',
  message: 'Book your dental check-up this week.',
})

const validSite = () => ({ ...emptySiteForm(), name: 'Appointment page', slug: 'appointment-page' })

const validSubmission = () => ({
  ...emptySubmissionForm('06a77082-53a2-4e9c-9c35-3214a76c9ba6'),
  full_name: 'Asha Rao',
  email: 'asha@example.test',
})

const validReview = () => ({ ...emptyReviewForm(), author: 'Ravi Kumar', rating: 5 })

describe('Growth schemas', () => {
  it('accepts a valid campaign and rejects an inverted date range', () => {
    expect(campaignSchema.safeParse(validCampaign()).success).toBe(true)
    expect(campaignSchema.safeParse({
      ...validCampaign(), starts_on: '2026-12-10', ends_on: '2026-12-01',
    }).success).toBe(false)
    expect(campaignSchema.safeParse({ ...validCampaign(), starts_on: '10/12/2026' }).success).toBe(false)
    expect(campaignSchema.safeParse({ ...validCampaign(), channel: 'carrier_pigeon' }).success).toBe(false)
    expect(campaignSchema.safeParse({ ...validCampaign(), objective: 'x'.repeat(501) }).success).toBe(false)
  })

  it('validates creatives against a real campaign id and message cap', () => {
    expect(creativeSchema.safeParse(validCreative()).success).toBe(true)
    expect(creativeSchema.safeParse({ ...validCreative(), campaign_id: '' }).success).toBe(false)
    expect(creativeSchema.safeParse({ ...validCreative(), message: '' }).success).toBe(false)
    expect(creativeSchema.safeParse({ ...validCreative(), message: 'x'.repeat(2001) }).success).toBe(false)
  })

  it('enforces the SQL slug and date rules', () => {
    expect(siteSchema.safeParse(validSite()).success).toBe(true)
    expect(siteSchema.safeParse({ ...validSite(), slug: 'Appointment Page' }).success).toBe(false)
    expect(siteSchema.safeParse({ ...validSite(), slug: '-leading' }).success).toBe(false)
    expect(siteSchema.safeParse({ ...validSite(), slug: 'x'.repeat(81) }).success).toBe(false)
    expect(siteSchema.safeParse({ ...validSite(), domain: null }).success).toBe(true)
  })

  it('requires a valid email for manually recorded submissions', () => {
    expect(submissionSchema.safeParse(validSubmission()).success).toBe(true)
    expect(submissionSchema.safeParse({ ...validSubmission(), email: 'not-an-email' }).success).toBe(false)
    expect(submissionSchema.safeParse({ ...validSubmission(), website_id: 'nope' }).success).toBe(false)
    expect(submissionSchema.safeParse({ ...validSubmission(), status: 'sent' }).success).toBe(false)
  })

  it('keeps ratings within 1–5 for both review types', () => {
    expect(reviewSchema.safeParse(validReview()).success).toBe(true)
    expect(reviewSchema.safeParse({ ...validReview(), rating: 0 }).success).toBe(false)
    expect(reviewSchema.safeParse({ ...validReview(), rating: 6 }).success).toBe(false)
    expect(reviewSchema.safeParse({ ...validReview(), rating: 4.5 }).success).toBe(false)
    expect(reviewSchema.safeParse({ ...validReview(), review_date: '2026-02-30' }).success).toBe(false)
    expect(reviewSchema.safeParse({ ...validReview(), status: 'responded' }).success).toBe(false)
    expect(feedbackSchema.safeParse({ ...emptyFeedbackForm(), customer: 'Meera', rating: 4 }).success).toBe(true)
    expect(feedbackSchema.safeParse({ ...emptyFeedbackForm(), customer: 'Meera', rating: 9 }).success).toBe(false)
    expect(feedbackSchema.safeParse({ ...emptyFeedbackForm(), customer: 'Meera', source: 'google' }).success).toBe(false)
  })

  it('requires a response before a review can be marked responded', () => {
    const id = '06a77082-53a2-4e9c-9c35-3214a76c9ba6'
    expect(reviewUpdateSchema.safeParse({ review_id: id, status: 'responded', response: null }).success).toBe(false)
    expect(reviewUpdateSchema.safeParse({ review_id: id, status: 'responded', response: '' }).success).toBe(false)
    expect(reviewUpdateSchema.safeParse({ review_id: id, status: 'responded', response: 'Thank you.' }).success).toBe(true)
    expect(reviewUpdateSchema.safeParse({ review_id: id, status: 'reviewed', response: null }).success).toBe(true)
  })

  it('has no provider, send, delivery or engagement fields', () => {
    const forms = [validCampaign(), validCreative(), validSite(), validSubmission(), validReview(), emptyFeedbackForm()]
    const forbidden = /provider|send|sent|deliver|open|click|reach|impression/i
    for (const form of forms) {
      expect(Object.keys(form).some((key) => forbidden.test(key))).toBe(false)
    }
  })
})
