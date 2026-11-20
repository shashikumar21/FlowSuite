import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAiAgentsData,
  fetchAiConversationsData,
  fetchIntegrationsData,
  fetchPublicAgent,
} from './api'

export const aiConsoleKeys = {
  all: (tenantId: string) => ['ai-console', tenantId] as const,
  agents: (tenantId: string) => ['ai-console', tenantId, 'agents'] as const,
  integrations: (tenantId: string) => ['ai-console', tenantId, 'integrations'] as const,
  conversations: (tenantId: string) => ['ai-console', tenantId, 'conversations'] as const,
  publicAgent: (publicKey: string) => ['ai-console', 'public-agent', publicKey] as const,
}

export function useAiAgentsData(tenantId: string | undefined) {
  return useQuery({
    queryKey: aiConsoleKeys.agents(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchAiAgentsData(tenantId as string),
  })
}

export function useIntegrationsData(tenantId: string | undefined) {
  return useQuery({
    queryKey: aiConsoleKeys.integrations(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchIntegrationsData(tenantId as string),
  })
}

export function useAiConversationsData(tenantId: string | undefined) {
  return useQuery({
    queryKey: aiConsoleKeys.conversations(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchAiConversationsData(tenantId as string),
  })
}

export function usePublicAgent(publicKey: string | null | undefined) {
  return useQuery({
    queryKey: aiConsoleKeys.publicAgent(publicKey ?? ''),
    enabled: Boolean(publicKey),
    queryFn: () => fetchPublicAgent(publicKey as string),
  })
}

export function useAiConsoleInvalidate(tenantId: string | undefined) {
  const queryClient = useQueryClient()
  return () => {
    if (!tenantId) return
    void queryClient.invalidateQueries({ queryKey: aiConsoleKeys.all(tenantId) })
    void queryClient.invalidateQueries({ queryKey: ['dashboard', tenantId] })
    void queryClient.invalidateQueries({ queryKey: ['inbox', tenantId] })
  }
}
