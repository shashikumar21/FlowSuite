import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCrmOptions } from './api'

export const crmKeys = {
  all: (tenantId: string) => ['crm', tenantId] as const,
  options: (tenantId: string) => ['crm', tenantId, 'options'] as const,
  contacts: (tenantId: string) => ['crm', tenantId, 'contacts'] as const,
  deals: (tenantId: string) => ['crm', tenantId, 'deals'] as const,
  metrics: (tenantId: string) => ['crm', tenantId, 'metrics'] as const,
}

/** CRM writes can change dashboard counts, so both caches are refreshed. */
export function useCrmInvalidate(tenantId: string | undefined) {
  const queryClient = useQueryClient()
  return () => {
    if (!tenantId) return
    void queryClient.invalidateQueries({ queryKey: crmKeys.all(tenantId) })
    void queryClient.invalidateQueries({ queryKey: ['dashboard', tenantId] })
  }
}

export function useCrmOptions(tenantId: string | undefined) {
  return useQuery({
    queryKey: crmKeys.options(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchCrmOptions(tenantId as string),
  })
}
