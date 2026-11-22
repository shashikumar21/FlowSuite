import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addSuppression,
  createCampaign,
  fetchApprovals,
  fetchCampaignDetail,
  fetchCampaigns,
  fetchDecisionMakerOptions,
  fetchDraftViews,
  fetchOutboxViews,
  fetchProspectOptions,
  fetchSuppression,
  markOutboxFailed,
  queueApprovedEmail,
  retryOutbox,
  reviewEmailDraft,
  saveEmailDraft,
  submitForApproval,
} from './api'
import { salesAgentKeys } from '../hooks'
import type { SaveDraftValues } from './api'
import type { ApprovalDecisionInput, CampaignCreateInput, DraftStatus } from './schemas'

export const outreachKeys = {
  all: (tenantId: string) => [...salesAgentKeys.all(tenantId), 'outreach'] as const,
  campaigns: (tenantId: string) => [...outreachKeys.all(tenantId), 'campaigns'] as const,
  campaign: (tenantId: string, campaignId: string) =>
    [...outreachKeys.campaigns(tenantId), campaignId] as const,
  drafts: (tenantId: string) => [...outreachKeys.all(tenantId), 'drafts'] as const,
  prospects: (tenantId: string) => [...outreachKeys.all(tenantId), 'prospects'] as const,
  decisionMakers: (tenantId: string) => [...outreachKeys.all(tenantId), 'decision-makers'] as const,
  suppression: (tenantId: string) => [...outreachKeys.all(tenantId), 'suppression'] as const,
  approvals: (tenantId: string) => [...outreachKeys.all(tenantId), 'approvals'] as const,
  outbox: (tenantId: string) => [...outreachKeys.all(tenantId), 'outbox'] as const,
}

export function useCampaigns(tenantId: string | undefined) {
  return useQuery({
    queryKey: outreachKeys.campaigns(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchCampaigns(tenantId as string),
  })
}

export function useCampaignDetail(tenantId: string | undefined, campaignId: string | undefined) {
  return useQuery({
    queryKey: outreachKeys.campaign(tenantId ?? '', campaignId ?? ''),
    enabled: Boolean(tenantId && campaignId),
    queryFn: () => fetchCampaignDetail(tenantId as string, campaignId as string),
  })
}

export function useDraftViews(tenantId: string | undefined, statuses?: DraftStatus[]) {
  return useQuery({
    queryKey: [...outreachKeys.drafts(tenantId ?? ''), statuses?.join(',') ?? 'all'] as const,
    enabled: Boolean(tenantId),
    queryFn: () => fetchDraftViews(tenantId as string, { statuses }),
  })
}

export function useProspectOptions(tenantId: string | undefined) {
  return useQuery({
    queryKey: outreachKeys.prospects(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchProspectOptions(tenantId as string),
  })
}

export function useDecisionMakerOptions(tenantId: string | undefined, prospectIds?: string[]) {
  return useQuery({
    queryKey: [...outreachKeys.decisionMakers(tenantId ?? ''), prospectIds?.join(',') ?? 'all'] as const,
    enabled: Boolean(tenantId),
    queryFn: () => fetchDecisionMakerOptions(tenantId as string, prospectIds),
  })
}

export function useSuppression(tenantId: string | undefined) {
  return useQuery({
    queryKey: outreachKeys.suppression(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchSuppression(tenantId as string),
  })
}

export function useApprovals(tenantId: string | undefined) {
  return useQuery({
    queryKey: outreachKeys.approvals(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchApprovals(tenantId as string),
  })
}

export function useOutboxViews(tenantId: string | undefined) {
  return useQuery({
    queryKey: outreachKeys.outbox(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchOutboxViews(tenantId as string),
  })
}

/** Refresh every tenant-scoped Sales Agent and outreach view after a write. */
export function useOutreachInvalidate(tenantId: string | undefined) {
  const queryClient = useQueryClient()
  return () => {
    if (tenantId) {
      void queryClient.invalidateQueries({ queryKey: salesAgentKeys.all(tenantId) })
    }
  }
}

export function useCreateCampaign(tenantId: string | undefined) {
  const invalidate = useOutreachInvalidate(tenantId)
  return useMutation({
    mutationFn: (values: CampaignCreateInput) => createCampaign(tenantId as string, values),
    onSuccess: invalidate,
  })
}

export function useSaveDraft(tenantId: string | undefined) {
  const invalidate = useOutreachInvalidate(tenantId)
  return useMutation({
    mutationFn: ({ messageId, values }: { messageId: string; values: SaveDraftValues }) =>
      saveEmailDraft(tenantId as string, messageId, values),
    onSuccess: invalidate,
  })
}

export function useSubmitForApproval(tenantId: string | undefined) {
  const invalidate = useOutreachInvalidate(tenantId)
  return useMutation({
    mutationFn: (messageId: string) => submitForApproval(tenantId as string, messageId),
    onSuccess: invalidate,
  })
}

export function useReviewDraft(tenantId: string | undefined) {
  const invalidate = useOutreachInvalidate(tenantId)
  return useMutation({
    mutationFn: (values: ApprovalDecisionInput) => reviewEmailDraft(tenantId as string, values),
    onSuccess: invalidate,
  })
}

export function useQueueEmail(tenantId: string | undefined) {
  const invalidate = useOutreachInvalidate(tenantId)
  return useMutation({
    mutationFn: (messageId: string) => queueApprovedEmail(tenantId as string, messageId),
    onSuccess: invalidate,
  })
}

export function useAddSuppression(tenantId: string | undefined) {
  const invalidate = useOutreachInvalidate(tenantId)
  return useMutation({
    mutationFn: (values: { email: string; reason: 'unsubscribe' | 'bounced' | 'complaint' | 'manual'; source: string | null }) =>
      addSuppression(tenantId as string, values.email, values.reason, values.source),
    onSuccess: invalidate,
  })
}

export function useOutboxActions(tenantId: string | undefined) {
  const invalidate = useOutreachInvalidate(tenantId)
  const fail = useMutation({
    mutationFn: ({ outboxId, error }: { outboxId: string; error: string }) =>
      markOutboxFailed(tenantId as string, outboxId, error),
    onSuccess: invalidate,
  })
  const retry = useMutation({
    mutationFn: (outboxId: string) => retryOutbox(tenantId as string, outboxId),
    onSuccess: invalidate,
  })
  return { fail, retry }
}
