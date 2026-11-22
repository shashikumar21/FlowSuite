import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createCallHandoff, fetchCallHandoffs, fetchCallSessions, fetchVoiceAgents, logCallSession, resolveCallHandoff, upsertVoiceAgent } from './api'
import type { CallLogFormValues, HandoffFormValues, VoiceAgentFormValues } from './schemas'

export const voiceKeys = {
  all: (tenantId: string) => ['voice', tenantId] as const,
  agents: (tenantId: string) => [...voiceKeys.all(tenantId), 'agents'] as const,
  calls: (tenantId: string) => [...voiceKeys.all(tenantId), 'calls'] as const,
  handoffs: (tenantId: string) => [...voiceKeys.all(tenantId), 'handoffs'] as const,
}

export function useVoiceAgents(tenantId: string | undefined) {
  return useQuery({ queryKey: voiceKeys.agents(tenantId ?? ''), enabled: Boolean(tenantId), queryFn: () => fetchVoiceAgents(tenantId!) })
}

export function useCallSessions(tenantId: string | undefined) {
  return useQuery({ queryKey: voiceKeys.calls(tenantId ?? ''), enabled: Boolean(tenantId), queryFn: () => fetchCallSessions(tenantId!) })
}

export function useCallHandoffs(tenantId: string | undefined) {
  return useQuery({ queryKey: voiceKeys.handoffs(tenantId ?? ''), enabled: Boolean(tenantId), queryFn: () => fetchCallHandoffs(tenantId!) })
}

export function useVoiceMutations(tenantId: string | undefined) {
  const qc = useQueryClient()
  const invalidate = () => {
    if (!tenantId) return
    void qc.invalidateQueries({ queryKey: voiceKeys.all(tenantId) })
  }
  return {
    upsertAgent: useMutation({ mutationFn: ({ agentId, values }: { agentId: string | null; values: VoiceAgentFormValues }) => upsertVoiceAgent(tenantId!, agentId, values), onSuccess: invalidate }),
    logCall: useMutation({ mutationFn: (values: CallLogFormValues) => logCallSession(tenantId!, values), onSuccess: invalidate }),
    createHandoff: useMutation({ mutationFn: (values: HandoffFormValues) => createCallHandoff(tenantId!, values), onSuccess: invalidate }),
    resolveHandoff: useMutation({ mutationFn: (handoffId: string) => resolveCallHandoff(tenantId!, handoffId), onSuccess: invalidate }),
  }
}
