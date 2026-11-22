import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWorkflows } from './api'

export const workflowKeys = {
  all: (tenantId: string) => ['workflows', tenantId] as const,
}

export function useWorkflows(tenantId: string | undefined) {
  return useQuery({
    queryKey: workflowKeys.all(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchWorkflows(tenantId as string),
  })
}

export function useWorkflowsInvalidate(tenantId: string | undefined) {
  const qc = useQueryClient()
  return () => { if (tenantId) void qc.invalidateQueries({ queryKey: workflowKeys.all(tenantId) }) }
}
