import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { salesAgentKeys } from '@/modules/sales-agent/hooks'
import {
  createGrowthCampaign,
  createGrowthCreative,
  createGrowthSite,
  deleteGrowthCampaign,
  deleteGrowthCreative,
  deleteGrowthFeedback,
  deleteGrowthReview,
  deleteGrowthSite,
  deleteGrowthSubmission,
  fetchGrowthCampaigns,
  fetchGrowthCreatives,
  fetchGrowthFeedback,
  fetchGrowthReviews,
  fetchGrowthSubmissions,
  fetchGrowthWebsites,
  recordGrowthFeedback,
  recordGrowthReview,
  recordGrowthSubmission,
  updateGrowthCampaign,
  updateGrowthCreative,
  updateGrowthFeedback,
  updateGrowthReview,
  updateGrowthSite,
  updateGrowthSubmission,
} from './api'
import type {
  CampaignFormValues,
  CreativeFormValues,
  FeedbackFormValues,
  ReviewFormValues,
  ReviewUpdateValues,
  SiteFormValues,
  SubmissionFormValues,
} from './schemas'
import type { GrowthSubmissionStatus } from '@/types/database'

/**
 * Growth cache. All keys hang off `salesAgentKeys.all(tenantId)`, matching the
 * Phase 4 pattern, so one invalidation refreshes every tenant-scoped view.
 */
export const growthKeys = {
  all: (tenantId: string) => [...salesAgentKeys.all(tenantId), 'growth'] as const,
  campaigns: (tenantId: string) => [...growthKeys.all(tenantId), 'campaigns'] as const,
  creatives: (tenantId: string, campaignId?: string) =>
    [...growthKeys.all(tenantId), 'creatives', campaignId ?? 'all'] as const,
  websites: (tenantId: string) => [...growthKeys.all(tenantId), 'websites'] as const,
  submissions: (tenantId: string, websiteId?: string) =>
    [...growthKeys.all(tenantId), 'submissions', websiteId ?? 'all'] as const,
  reviews: (tenantId: string) => [...growthKeys.all(tenantId), 'reviews'] as const,
  feedback: (tenantId: string) => [...growthKeys.all(tenantId), 'feedback'] as const,
}

export function useGrowthCampaigns(tenantId: string | undefined) {
  return useQuery({
    queryKey: growthKeys.campaigns(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchGrowthCampaigns(tenantId as string),
  })
}

export function useGrowthCreatives(tenantId: string | undefined, campaignId?: string) {
  return useQuery({
    queryKey: growthKeys.creatives(tenantId ?? '', campaignId),
    enabled: Boolean(tenantId),
    queryFn: () => fetchGrowthCreatives(tenantId as string, campaignId),
  })
}

export function useGrowthWebsites(tenantId: string | undefined) {
  return useQuery({
    queryKey: growthKeys.websites(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchGrowthWebsites(tenantId as string),
  })
}

export function useGrowthSubmissions(tenantId: string | undefined, websiteId?: string) {
  return useQuery({
    queryKey: growthKeys.submissions(tenantId ?? '', websiteId),
    enabled: Boolean(tenantId),
    queryFn: () => fetchGrowthSubmissions(tenantId as string, websiteId),
  })
}

export function useGrowthReviews(tenantId: string | undefined) {
  return useQuery({
    queryKey: growthKeys.reviews(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchGrowthReviews(tenantId as string),
  })
}

export function useGrowthFeedback(tenantId: string | undefined) {
  return useQuery({
    queryKey: growthKeys.feedback(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchGrowthFeedback(tenantId as string),
  })
}

/** Refresh all Growth views after any trusted RPC write. */
export function useGrowthInvalidate(tenantId: string | undefined) {
  const queryClient = useQueryClient()
  return () => {
    if (tenantId) void queryClient.invalidateQueries({ queryKey: growthKeys.all(tenantId) })
  }
}

function useGrowthMutation<T>(tenantId: string | undefined, mutationFn: (values: T) => Promise<unknown>) {
  const invalidate = useGrowthInvalidate(tenantId)
  return useMutation({ mutationFn, onSuccess: invalidate })
}

export function useCreateGrowthCampaign(tenantId: string | undefined) {
  return useGrowthMutation<CampaignFormValues>(tenantId, (values) =>
    createGrowthCampaign(tenantId as string, values),
  )
}

export function useUpdateGrowthCampaign(tenantId: string | undefined) {
  return useGrowthMutation<{ id: string; values: CampaignFormValues }>(tenantId, ({ id, values }) =>
    updateGrowthCampaign(tenantId as string, id, values),
  )
}

export function useDeleteGrowthCampaign(tenantId: string | undefined) {
  return useGrowthMutation<string>(tenantId, (id) => deleteGrowthCampaign(tenantId as string, id))
}

export function useCreateGrowthCreative(tenantId: string | undefined) {
  return useGrowthMutation<CreativeFormValues>(tenantId, (values) =>
    createGrowthCreative(tenantId as string, values),
  )
}

export function useUpdateGrowthCreative(tenantId: string | undefined) {
  return useGrowthMutation<{ id: string; values: CreativeFormValues }>(tenantId, ({ id, values }) =>
    updateGrowthCreative(tenantId as string, id, values),
  )
}

export function useDeleteGrowthCreative(tenantId: string | undefined) {
  return useGrowthMutation<string>(tenantId, (id) => deleteGrowthCreative(tenantId as string, id))
}

export function useCreateGrowthSite(tenantId: string | undefined) {
  return useGrowthMutation<SiteFormValues>(tenantId, (values) => createGrowthSite(tenantId as string, values))
}

export function useUpdateGrowthSite(tenantId: string | undefined) {
  return useGrowthMutation<{ id: string; values: SiteFormValues }>(tenantId, ({ id, values }) =>
    updateGrowthSite(tenantId as string, id, values),
  )
}

export function useDeleteGrowthSite(tenantId: string | undefined) {
  return useGrowthMutation<string>(tenantId, (id) => deleteGrowthSite(tenantId as string, id))
}

export function useRecordGrowthSubmission(tenantId: string | undefined) {
  return useGrowthMutation<SubmissionFormValues>(tenantId, (values) =>
    recordGrowthSubmission(tenantId as string, values),
  )
}

export function useUpdateGrowthSubmission(tenantId: string | undefined) {
  return useGrowthMutation<{ id: string; status: GrowthSubmissionStatus }>(tenantId, ({ id, status }) =>
    updateGrowthSubmission(tenantId as string, id, status),
  )
}

export function useDeleteGrowthSubmission(tenantId: string | undefined) {
  return useGrowthMutation<string>(tenantId, (id) => deleteGrowthSubmission(tenantId as string, id))
}

export function useRecordGrowthReview(tenantId: string | undefined) {
  return useGrowthMutation<ReviewFormValues>(tenantId, (values) => recordGrowthReview(tenantId as string, values))
}

export function useUpdateGrowthReview(tenantId: string | undefined) {
  return useGrowthMutation<ReviewUpdateValues>(tenantId, (values) => updateGrowthReview(tenantId as string, values))
}

export function useDeleteGrowthReview(tenantId: string | undefined) {
  return useGrowthMutation<string>(tenantId, (id) => deleteGrowthReview(tenantId as string, id))
}

export function useRecordGrowthFeedback(tenantId: string | undefined) {
  return useGrowthMutation<FeedbackFormValues>(tenantId, (values) =>
    recordGrowthFeedback(tenantId as string, values),
  )
}

export function useUpdateGrowthFeedback(tenantId: string | undefined) {
  return useGrowthMutation<{ id: string; status: FeedbackFormValues['status'] }>(tenantId, ({ id, status }) =>
    updateGrowthFeedback(tenantId as string, id, status),
  )
}

export function useDeleteGrowthFeedback(tenantId: string | undefined) {
  return useGrowthMutation<string>(tenantId, (id) => deleteGrowthFeedback(tenantId as string, id))
}
