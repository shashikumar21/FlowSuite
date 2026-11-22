import { z } from 'zod'

/**
 * Growth form validation. These mirror the CHECK constraints in
 * 0021_growth_modules.sql; the RPCs remain the authoritative enforcement point.
 */

export const growthChannels = ['whatsapp', 'sms', 'ads', 'social', 'email', 'other'] as const
export const campaignStatuses = ['draft', 'planned', 'active', 'paused', 'completed', 'cancelled'] as const
export const creativeStatuses = ['draft', 'ready', 'used', 'archived'] as const
export const siteStatuses = ['draft', 'published', 'archived'] as const
export const submissionStatuses = ['new', 'reviewed', 'archived'] as const
export const reviewStatuses = ['new', 'reviewed', 'responded', 'archived'] as const
export const reviewSources = ['google', 'facebook', 'website', 'other'] as const
export const feedbackSources = ['in_person', 'website', 'whatsapp', 'other'] as const

const optionalText = (max: number) =>
  z.union([z.string().trim().max(max), z.null()]).transform((value) => value?.trim() || null)

const requiredText = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required`).max(max)

export const campaignSchema = z.object({
  name: requiredText(120, 'Campaign name'),
  channel: z.enum(growthChannels),
  objective: requiredText(500, 'Objective'),
  status: z.enum(campaignStatuses),
  starts_on: z.iso.date().nullable(),
  ends_on: z.iso.date().nullable(),
  notes: optionalText(2000),
}).refine((value) => !value.starts_on || !value.ends_on || value.ends_on >= value.starts_on, {
  message: 'End date cannot be before the start date',
  path: ['ends_on'],
})

export type CampaignFormValues = z.infer<typeof campaignSchema>

export const emptyCampaignForm = (): CampaignFormValues => ({
  name: '',
  channel: 'whatsapp',
  objective: '',
  status: 'draft',
  starts_on: null,
  ends_on: null,
  notes: null,
})

export const creativeSchema = z.object({
  campaign_id: z.string().uuid('Select a campaign'),
  name: requiredText(120, 'Creative name'),
  channel: z.enum(growthChannels),
  headline: optionalText(200),
  message: requiredText(2000, 'Message'),
  cta: optionalText(200),
  status: z.enum(creativeStatuses),
})

export type CreativeFormValues = z.infer<typeof creativeSchema>

export const siteSchema = z.object({
  name: requiredText(120, 'Website name'),
  slug: z.string().trim().toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens')
    .min(1).max(80),
  domain: optionalText(200),
  status: z.enum(siteStatuses),
  notes: optionalText(2000),
})

export type SiteFormValues = z.infer<typeof siteSchema>

export const submissionSchema = z.object({
  website_id: z.string().uuid('Select a website'),
  full_name: requiredText(150, 'Name'),
  email: z.string().trim().email('Enter a valid email address').max(255),
  message: optionalText(2000),
  status: z.enum(submissionStatuses),
})

export type SubmissionFormValues = z.infer<typeof submissionSchema>

export const submissionUpdateSchema = z.object({
  submission_id: z.string().uuid(),
  status: z.enum(submissionStatuses),
})

export const reviewSchema = z.object({
  source: z.enum(reviewSources),
  author: requiredText(150, 'Author'),
  rating: z.number().int().min(1).max(5),
  title: optionalText(200),
  body: optionalText(4000),
  review_date: z.iso.date().nullable(),
  status: z.enum(reviewStatuses),
}).refine((value) => value.status !== 'responded', {
  message: 'Record the review first, then add a response',
  path: ['status'],
})

export type ReviewFormValues = z.infer<typeof reviewSchema>

export const reviewUpdateSchema = z.object({
  review_id: z.string().uuid(),
  status: z.enum(reviewStatuses),
  response: optionalText(4000),
}).refine((value) => value.status !== 'responded' || Boolean(value.response), {
  message: 'Add a response before marking this review as responded',
  path: ['response'],
})

export type ReviewUpdateValues = z.infer<typeof reviewUpdateSchema>

export const feedbackSchema = z.object({
  source: z.enum(feedbackSources),
  customer: requiredText(150, 'Customer'),
  rating: z.number().int().min(1).max(5),
  comment: optionalText(4000),
  status: z.enum(submissionStatuses),
})

export type FeedbackFormValues = z.infer<typeof feedbackSchema>

export const feedbackUpdateSchema = z.object({
  feedback_id: z.string().uuid(),
  status: z.enum(submissionStatuses),
})

export const emptyCreativeForm = (campaignId = ''): CreativeFormValues => ({
  campaign_id: campaignId,
  name: '',
  channel: 'whatsapp',
  headline: null,
  message: '',
  cta: null,
  status: 'draft',
})

export const emptySiteForm = (): SiteFormValues => ({
  name: '',
  slug: '',
  domain: null,
  status: 'draft',
  notes: null,
})

export const emptySubmissionForm = (websiteId = ''): SubmissionFormValues => ({
  website_id: websiteId,
  full_name: '',
  email: '',
  message: null,
  status: 'new',
})

export const emptyReviewForm = (): ReviewFormValues => ({
  source: 'google',
  author: '',
  rating: 5,
  title: null,
  body: null,
  review_date: null,
  status: 'new',
})

export const emptyFeedbackForm = (): FeedbackFormValues => ({
  source: 'in_person',
  customer: '',
  rating: 5,
  comment: null,
  status: 'new',
})
