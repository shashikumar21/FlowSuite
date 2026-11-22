import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchProspectSearches, fetchProspects, fetchSalesMembers, fetchSalesMetrics } from './api'

export const salesAgentKeys = {
  all: (tenantId: string) => ['sales-agent', tenantId] as const,
  metrics: (tenantId: string) => ['sales-agent', tenantId, 'metrics'] as const,
  prospects: (tenantId: string) => ['sales-agent', tenantId, 'prospects'] as const,
  searches: (tenantId: string) => ['sales-agent', tenantId, 'searches'] as const,
  members: (tenantId: string) => ['sales-agent', tenantId, 'members'] as const,
}

export function useSalesMetrics(tenantId: string | undefined) {
  return useQuery({
    queryKey: salesAgentKeys.metrics(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchSalesMetrics(tenantId as string),
  })
}

export function useProspects(tenantId: string | undefined) {
  return useQuery({
    queryKey: salesAgentKeys.prospects(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchProspects(tenantId as string),
  })
}

export function useProspectSearches(tenantId: string | undefined) {
  return useQuery({
    queryKey: salesAgentKeys.searches(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchProspectSearches(tenantId as string),
  })
}

export function useSalesMembers(tenantId: string | undefined) {
  return useQuery({
    queryKey: salesAgentKeys.members(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchSalesMembers(tenantId as string),
    staleTime: 5 * 60 * 1000,
  })
}

/** Call after any Sales Agent mutation so all tenant-scoped views refresh. */
export function useSalesAgentInvalidate(tenantId: string | undefined) {
  const queryClient = useQueryClient()
  return () => {
    if (tenantId) void queryClient.invalidateQueries({ queryKey: salesAgentKeys.all(tenantId) })
  }
}
