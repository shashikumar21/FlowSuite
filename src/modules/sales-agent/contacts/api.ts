import { requireSupabase } from '@/integrations/supabase/client'
import type {
  ContactVerificationRow,
  DecisionMakerRow,
  Json,
  OutreachReplyRow,
  ProspectRow,
  ProspectSignalRow,
} from '@/types/database'
import type {
  DecisionMakerFormValues,
  ReplyFormValues,
  ReplyTriageValues,
  SignalFormValues,
  VerificationFormValues,
} from './schemas'
import { buildManualEvidence, normalizeEmail } from './utils'

/**
 * Phase 4 data access. Reads are tenant-scoped SELECTs; every write goes
 * through a trusted RPC. Nothing here calls a provider or sends an email.
 */

export type ProspectOption = Pick<ProspectRow, 'id' | 'business_name' | 'email' | 'verification_status'>

export async function fetchProspectOptions(tenantId: string): Promise<ProspectOption[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('prospects')
    .select('id, business_name, email, verification_status')
    .eq('tenant_id', tenantId)
    .order('business_name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function fetchDecisionMakers(
  tenantId: string,
  prospectId?: string,
): Promise<DecisionMakerRow[]> {
  const supabase = requireSupabase()
  let query = supabase
    .from('decision_makers')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('full_name', { ascending: true })
  if (prospectId) query = query.eq('prospect_id', prospectId)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function fetchVerifications(
  tenantId: string,
  options: { entityType?: 'prospect' | 'decision_maker'; entityId?: string } = {},
): Promise<ContactVerificationRow[]> {
  const supabase = requireSupabase()
  let query = supabase
    .from('contact_verifications')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('checked_at', { ascending: false })
  if (options.entityType) query = query.eq('entity_type', options.entityType)
  if (options.entityId) query = query.eq('entity_id', options.entityId)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function fetchSignals(
  tenantId: string,
  prospectId?: string,
): Promise<ProspectSignalRow[]> {
  const supabase = requireSupabase()
  let query = supabase
    .from('prospect_signals')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (prospectId) query = query.eq('prospect_id', prospectId)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export type ReplyView = {
  reply: OutreachReplyRow
  prospectName: string | null
  messageSubject: string | null
}

/** Assembled in memory because Phase 4 adds no PostgREST relationship joins. */
export async function fetchReplyViews(tenantId: string): Promise<ReplyView[]> {
  const [replies, prospects, messages] = await Promise.all([
    (async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('outreach_replies')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('received_at', { ascending: false })
      if (error) throw error
      return data ?? []
    })(),
    fetchProspectOptions(tenantId),
    (async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from('outreach_messages')
        .select('id, subject')
        .eq('tenant_id', tenantId)
      if (error) throw error
      return data ?? []
    })(),
  ])
  const prospectsById = new Map(prospects.map((item) => [item.id, item.business_name]))
  const subjectsById = new Map(messages.map((item) => [item.id, item.subject]))
  return replies.map((reply) => ({
    reply,
    prospectName: prospectsById.get(reply.prospect_id) ?? null,
    messageSubject: reply.message_id ? subjectsById.get(reply.message_id) ?? null : null,
  }))
}

export async function createDecisionMaker(
  tenantId: string,
  values: DecisionMakerFormValues,
): Promise<string> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('sales_create_decision_maker', {
    p_tenant: tenantId,
    p_prospect: values.prospect_id,
    p_full_name: values.full_name,
    p_job_title: values.job_title,
    p_email: values.email || null,
    p_phone: values.phone,
    p_linkedin_url: values.linkedin_url,
    p_research_source: values.research_source,
  })
  if (error) throw error
  if (!data) throw new Error('The decision maker could not be saved.')
  return data
}

export async function updateDecisionMaker(
  tenantId: string,
  decisionMakerId: string,
  values: DecisionMakerFormValues,
): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('sales_update_decision_maker', {
    p_tenant: tenantId,
    p_decision_maker: decisionMakerId,
    p_full_name: values.full_name,
    p_job_title: values.job_title,
    p_email: values.email || null,
    p_phone: values.phone,
    p_linkedin_url: values.linkedin_url,
    p_research_source: values.research_source,
  })
  if (error) throw error
}

export async function deleteDecisionMaker(tenantId: string, decisionMakerId: string): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('sales_delete_decision_maker', {
    p_tenant: tenantId,
    p_decision_maker: decisionMakerId,
  })
  if (error) throw error
}

export async function recordVerification(
  tenantId: string,
  values: VerificationFormValues,
): Promise<string> {
  const supabase = requireSupabase()
  const evidence: Json = buildManualEvidence(values.note)
  const { data, error } = await supabase.rpc('sales_record_verification', {
    p_tenant: tenantId,
    p_entity_type: values.entity_type,
    p_entity_id: values.entity_id,
    p_status: values.status,
    p_method: 'manual',
    p_evidence: evidence,
  })
  if (error) throw error
  if (!data) throw new Error('The verification could not be recorded.')
  return data
}

export async function addSignal(tenantId: string, values: SignalFormValues): Promise<string> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('sales_add_signal', {
    p_tenant: tenantId,
    p_prospect: values.prospect_id,
    p_signal_type: values.signal_type,
    p_summary: values.summary,
    p_source_url: values.source_url,
  })
  if (error) throw error
  if (!data) throw new Error('The signal could not be saved.')
  return data
}

export async function deleteSignal(tenantId: string, signalId: string): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('sales_delete_signal', {
    p_tenant: tenantId,
    p_signal: signalId,
  })
  if (error) throw error
}

export async function recordReply(tenantId: string, values: ReplyFormValues): Promise<string> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('sales_record_reply', {
    p_tenant: tenantId,
    p_prospect: values.prospect_id,
    p_message: values.message_id,
    p_campaign: values.campaign_id,
    p_sender_email: values.sender_email ? normalizeEmail(values.sender_email) : null,
    p_subject: values.subject,
    p_body: values.body,
    p_classification: values.classification,
    p_external_id: values.external_id,
    p_received_at: values.received_at,
  })
  if (error) throw error
  if (!data) throw new Error('The reply could not be saved.')
  return data
}

export async function updateReply(tenantId: string, values: ReplyTriageValues): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('sales_update_reply', {
    p_tenant: tenantId,
    p_reply: values.reply_id,
    p_reply_status: values.reply_status,
    p_classification: values.classification,
  })
  if (error) throw error
}

export async function deleteReply(tenantId: string, replyId: string): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('sales_delete_reply', {
    p_tenant: tenantId,
    p_reply: replyId,
  })
  if (error) throw error
}
