import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchInboxConversations,
  fetchInboxMessages,
  fetchInboxMetrics,
  fetchInboxOptions,
} from './api'

/** No Realtime in this codebase; poll the two live views instead. */
const POLL_INTERVAL = 30_000

export const inboxKeys = {
  all: (tenantId: string) => ['inbox', tenantId] as const,
  conversations: (tenantId: string) => ['inbox', tenantId, 'conversations'] as const,
  messages: (tenantId: string, conversationId: string) => ['inbox', tenantId, 'messages', conversationId] as const,
  metrics: (tenantId: string) => ['inbox', tenantId, 'metrics'] as const,
  options: (tenantId: string) => ['inbox', tenantId, 'options'] as const,
}

/** Inbox writes can change the list, thread, metrics and assignment labels. */
export function useInboxInvalidate(tenantId: string | undefined) {
  const queryClient = useQueryClient()
  return () => {
    if (!tenantId) return
    void queryClient.invalidateQueries({ queryKey: inboxKeys.all(tenantId) })
  }
}

export function useInboxConversations(tenantId: string | undefined) {
  return useQuery({
    queryKey: inboxKeys.conversations(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchInboxConversations(tenantId as string),
    refetchInterval: POLL_INTERVAL,
  })
}

export function useInboxMessages(tenantId: string | undefined, conversationId: string | null) {
  return useQuery({
    queryKey: inboxKeys.messages(tenantId ?? '', conversationId ?? ''),
    enabled: Boolean(tenantId && conversationId),
    queryFn: () => fetchInboxMessages(tenantId as string, conversationId as string),
    refetchInterval: POLL_INTERVAL,
  })
}

export function useInboxMetrics(tenantId: string | undefined) {
  return useQuery({
    queryKey: inboxKeys.metrics(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchInboxMetrics(tenantId as string),
    refetchInterval: POLL_INTERVAL,
  })
}

export function useInboxOptions(tenantId: string | undefined) {
  return useQuery({
    queryKey: inboxKeys.options(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchInboxOptions(tenantId as string),
  })
}
