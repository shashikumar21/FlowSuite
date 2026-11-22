import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addSignal,
  createDecisionMaker,
  deleteDecisionMaker,
  deleteReply,
  deleteSignal,
  fetchDecisionMakers,
  fetchProspectOptions,
  fetchReplyViews,
  fetchSignals,
  fetchVerifications,
  recordReply,
  recordVerification,
  updateDecisionMaker,
  updateReply,
} from './api'
import { salesAgentKeys } from '../hooks'
import type {
  DecisionMakerFormValues,
  ReplyFormValues,
  ReplyTriageValues,
  SignalFormValues,
  VerificationFormValues,
} from './schemas'

/**
 * Phase 4 query cache. All keys hang off salesAgentKeys so a single
 * invalidation refreshes the overview counts and every contacts view.
 */
export const contactsKeys = {
  all: (tenantId: string) => [...salesAgentKeys.all(tenantId), 'contacts'] as const,
  prospects: (tenantId: string) => [...contactsKeys.all(tenantId), 'prospects'] as const,
  decisionMakers: (tenantId: string, prospectId?: string) =>
    [...contactsKeys.all(tenantId), 'decision-makers', prospectId ?? 'all'] as const,
  verifications: (tenantId: string, entityType?: string, entityId?: string) =>
    [...contactsKeys.all(tenantId), 'verifications', entityType ?? 'all', entityId ?? 'all'] as const,
  signals: (tenantId: string, prospectId?: string) =>
    [...contactsKeys.all(tenantId), 'signals', prospectId ?? 'all'] as const,
  replies: (tenantId: string) => [...contactsKeys.all(tenantId), 'replies'] as const,
}

export function useProspectOptions(tenantId: string | undefined) {
  return useQuery({
    queryKey: contactsKeys.prospects(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchProspectOptions(tenantId as string),
  })
}

export function useDecisionMakers(tenantId: string | undefined, prospectId?: string) {
  return useQuery({
    queryKey: contactsKeys.decisionMakers(tenantId ?? '', prospectId),
    enabled: Boolean(tenantId),
    queryFn: () => fetchDecisionMakers(tenantId as string, prospectId),
  })
}

export function useVerifications(
  tenantId: string | undefined,
  options: { entityType?: 'prospect' | 'decision_maker'; entityId?: string } = {},
) {
  return useQuery({
    queryKey: contactsKeys.verifications(tenantId ?? '', options.entityType, options.entityId),
    enabled: Boolean(tenantId),
    queryFn: () => fetchVerifications(tenantId as string, options),
  })
}

export function useSignals(tenantId: string | undefined, prospectId?: string) {
  return useQuery({
    queryKey: contactsKeys.signals(tenantId ?? '', prospectId),
    enabled: Boolean(tenantId),
    queryFn: () => fetchSignals(tenantId as string, prospectId),
  })
}

export function useReplyViews(tenantId: string | undefined) {
  return useQuery({
    queryKey: contactsKeys.replies(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchReplyViews(tenantId as string),
  })
}

/** Refresh every tenant-scoped Sales Agent view after a Phase 4 write. */
export function useContactsInvalidate(tenantId: string | undefined) {
  const queryClient = useQueryClient()
  return () => {
    if (tenantId) void queryClient.invalidateQueries({ queryKey: salesAgentKeys.all(tenantId) })
  }
}

export function useCreateDecisionMaker(tenantId: string | undefined) {
  const invalidate = useContactsInvalidate(tenantId)
  return useMutation({
    mutationFn: (values: DecisionMakerFormValues) => createDecisionMaker(tenantId as string, values),
    onSuccess: invalidate,
  })
}

export function useUpdateDecisionMaker(tenantId: string | undefined) {
  const invalidate = useContactsInvalidate(tenantId)
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: DecisionMakerFormValues }) =>
      updateDecisionMaker(tenantId as string, id, values),
    onSuccess: invalidate,
  })
}

export function useDeleteDecisionMaker(tenantId: string | undefined) {
  const invalidate = useContactsInvalidate(tenantId)
  return useMutation({
    mutationFn: (id: string) => deleteDecisionMaker(tenantId as string, id),
    onSuccess: invalidate,
  })
}

export function useRecordVerification(tenantId: string | undefined) {
  const invalidate = useContactsInvalidate(tenantId)
  return useMutation({
    mutationFn: (values: VerificationFormValues) => recordVerification(tenantId as string, values),
    onSuccess: invalidate,
  })
}

export function useAddSignal(tenantId: string | undefined) {
  const invalidate = useContactsInvalidate(tenantId)
  return useMutation({
    mutationFn: (values: SignalFormValues) => addSignal(tenantId as string, values),
    onSuccess: invalidate,
  })
}

export function useDeleteSignal(tenantId: string | undefined) {
  const invalidate = useContactsInvalidate(tenantId)
  return useMutation({
    mutationFn: (id: string) => deleteSignal(tenantId as string, id),
    onSuccess: invalidate,
  })
}

export function useRecordReply(tenantId: string | undefined) {
  const invalidate = useContactsInvalidate(tenantId)
  return useMutation({
    mutationFn: (values: ReplyFormValues) => recordReply(tenantId as string, values),
    onSuccess: invalidate,
  })
}

export function useUpdateReply(tenantId: string | undefined) {
  const invalidate = useContactsInvalidate(tenantId)
  return useMutation({
    mutationFn: (values: ReplyTriageValues) => updateReply(tenantId as string, values),
    onSuccess: invalidate,
  })
}

export function useDeleteReply(tenantId: string | undefined) {
  const invalidate = useContactsInvalidate(tenantId)
  return useMutation({
    mutationFn: (id: string) => deleteReply(tenantId as string, id),
    onSuccess: invalidate,
  })
}
