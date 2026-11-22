import { requireSupabase } from '@/integrations/supabase/client'
import type { CallHandoffRow, CallSessionRow, VoiceAgentRow } from './types'
import type { CallLogFormValues, HandoffFormValues, VoiceAgentFormValues } from './schemas'

export async function fetchVoiceAgents(tenantId: string): Promise<VoiceAgentRow[]> {
  const { data, error } = await requireSupabase()
    .from('voice_agents')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as VoiceAgentRow[]
}

export async function fetchCallSessions(tenantId: string): Promise<CallSessionRow[]> {
  const { data, error } = await requireSupabase()
    .from('call_sessions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as CallSessionRow[]
}

export async function fetchCallHandoffs(tenantId: string): Promise<CallHandoffRow[]> {
  const { data, error } = await requireSupabase()
    .from('call_handoffs')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as CallHandoffRow[]
}

export async function upsertVoiceAgent(tenantId: string, agentId: string | null, values: VoiceAgentFormValues): Promise<string> {
  const { data, error } = await requireSupabase().rpc('voice_upsert_agent', {
    p_tenant: tenantId,
    p_agent: agentId,
    p_name: values.name,
    p_status: values.status,
    p_direction: values.direction,
    p_languages: values.languages,
    p_greeting: values.greeting || null,
    p_faq_summary: values.faq_summary || null,
    p_booking_mode: values.booking_mode,
    p_handoff_phone: values.handoff_phone || null,
    p_provider: values.provider,
    p_provider_phone_number: values.provider_phone_number || null,
  })
  if (error) throw error
  return data as string
}

export async function logCallSession(tenantId: string, values: CallLogFormValues): Promise<string> {
  const { data, error } = await requireSupabase().rpc('voice_log_call_session', {
    p_tenant: tenantId,
    p_agent: values.agent_id || null,
    p_contact: values.contact_id || null,
    p_direction: values.direction,
    p_status: values.status,
    p_provider: values.provider,
    p_from_number: values.from_number || null,
    p_to_number: values.to_number || null,
    p_language: values.language || null,
    p_started_at: values.started_at ? new Date(values.started_at).toISOString() : null,
    p_ended_at: values.ended_at ? new Date(values.ended_at).toISOString() : null,
    p_duration_seconds: values.duration_seconds ? Number(values.duration_seconds) : null,
    p_outcome: values.outcome || null,
    p_summary: values.summary || null,
    p_consent_recording: values.consent_recording,
    p_needs_handoff: values.needs_handoff,
  })
  if (error) throw error
  return data as string
}

export async function createCallHandoff(tenantId: string, values: HandoffFormValues): Promise<string> {
  const { data, error } = await requireSupabase().rpc('voice_create_handoff', {
    p_tenant: tenantId,
    p_call_session: values.call_session_id,
    p_reason: values.reason,
    p_assigned_to: values.assigned_to || null,
    p_notes: values.notes || null,
  })
  if (error) throw error
  return data as string
}

export async function resolveCallHandoff(tenantId: string, handoffId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('voice_resolve_handoff', { p_tenant: tenantId, p_handoff: handoffId })
  if (error) throw error
}
