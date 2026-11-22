import type {
  GrowthCampaignStatus,
  GrowthChannel,
  GrowthCreativeStatus,
  GrowthFeedbackSource,
  GrowthReviewSource,
  GrowthReviewStatus,
  GrowthSiteStatus,
  GrowthSubmissionStatus,
  TenantRole,
} from '@/types/database'
import { campaignStatuses, creativeStatuses, feedbackSources, growthChannels, reviewSources, reviewStatuses, siteStatuses, submissionStatuses } from './schemas'
import type { GrowthSummary } from './types'

const labels = <T extends string>(values: readonly T[]) =>
  Object.fromEntries(values.map((value) => [value, value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ')])) as Record<T, string>

const channelLabels = labels(growthChannels) as Record<GrowthChannel, string>
const campaignStatusLabels = labels(campaignStatuses) as Record<GrowthCampaignStatus, string>
const creativeStatusLabels = labels(creativeStatuses) as Record<GrowthCreativeStatus, string>
const siteStatusLabels = labels(siteStatuses) as Record<GrowthSiteStatus, string>
const submissionStatusLabels = labels(submissionStatuses) as Record<GrowthSubmissionStatus, string>
const reviewStatusLabels = labels(reviewStatuses) as Record<GrowthReviewStatus, string>
const reviewSourceLabels = labels(reviewSources) as Record<GrowthReviewSource, string>
const feedbackSourceLabels = labels(feedbackSources) as Record<GrowthFeedbackSource, string>

channelLabels.whatsapp = 'WhatsApp'
channelLabels.sms = 'SMS'
channelLabels.ads = 'Ads'

export const growthChannelLabel = (value: GrowthChannel) => channelLabels[value] ?? value
export const campaignStatusLabel = (value: GrowthCampaignStatus) => campaignStatusLabels[value] ?? value
export const creativeStatusLabel = (value: GrowthCreativeStatus) => creativeStatusLabels[value] ?? value
export const siteStatusLabel = (value: GrowthSiteStatus) => siteStatusLabels[value] ?? value
export const submissionStatusLabel = (value: GrowthSubmissionStatus) => submissionStatusLabels[value] ?? value
export const reviewStatusLabel = (value: GrowthReviewStatus) => reviewStatusLabels[value] ?? value
export const reviewSourceLabel = (value: GrowthReviewSource) => reviewSourceLabels[value] ?? value
export const feedbackSourceLabel = (value: GrowthFeedbackSource) => feedbackSourceLabels[value] ?? value

export function statusVariant(status: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'active' || status === 'published' || status === 'ready' || status === 'responded') return 'success'
  if (status === 'planned' || status === 'new' || status === 'reviewed') return 'warning'
  if (status === 'paused' || status === 'cancelled' || status === 'archived' || status === 'used') return 'danger'
  return 'neutral'
}

/** UX only. Deletes are checked again server-side by `can_manage_sales_agent()`. */
export function canManageGrowth(role: TenantRole | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

export function ratingLabel(rating: number): string {
  return `${rating}/5`
}

export function buildGrowthSummary(input: {
  campaigns: readonly { status: GrowthCampaignStatus }[]
  creatives: readonly unknown[]
  websites: readonly unknown[]
  submissions: readonly { status: GrowthSubmissionStatus }[]
  reviews: readonly { status: GrowthReviewStatus }[]
  feedback: readonly unknown[]
}): GrowthSummary {
  return {
    campaigns: input.campaigns.length,
    activeCampaigns: input.campaigns.filter((item) => item.status === 'active').length,
    creatives: input.creatives.length,
    websites: input.websites.length,
    submissions: input.submissions.length,
    newSubmissions: input.submissions.filter((item) => item.status === 'new').length,
    reviews: input.reviews.length,
    newReviews: input.reviews.filter((item) => item.status === 'new').length,
    feedback: input.feedback.length,
  }
}
