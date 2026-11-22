import { requireSupabase } from '@/integrations/supabase/client'
import type {
  Json,
  OutreachCampaignRow,
  OutreachMessageRow,
  OutreachOutboxRow,
  SalesCampaignSummary,
  SalesEmailApprovalRow,
  SuppressionRow,
} from '@/types/database'
import type {
  ApprovalDecisionInput,
  CampaignCreateInput,
  DraftStatus,
  EmailDraftInput,
  GeneratedDraft,
} from './schemas'
import type {
  CampaignDetail,
  DecisionMakerOption,
  DraftView,
  OutboxItemView,
  ProspectOption,
} from './types'

/**
 * Phase 3 data access. Reads use the tenant-scoped SELECT policies; every
 * write goes through a trusted RPC. Nothing here can approve, send, or mark a
 * message delivered — those states are owned by the database and (later) a
 * separately deployed sender.
 */

export async function fetchCampaigns(tenantId: string): Promise<OutreachCampaignRow[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('outreach_campaigns')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchMessages(
  tenantId: string,
  options: { campaignId?: string; statuses?: DraftStatus[] } = {},
): Promise<OutreachMessageRow[]> {
  const supabase = requireSupabase()
  let query = supabase
    .from('outreach_messages')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (options.campaignId) query = query.eq('campaign_id', options.campaignId)
  if (options.statuses?.length) query = query.in('status', options.statuses)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function fetchProspectOptions(tenantId: string): Promise<ProspectOption[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('prospects')
    .select('id, business_name, email, industry, website, city, lead_status')
    .eq('tenant_id', tenantId)
    .order('business_name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function fetchDecisionMakerOptions(
  tenantId: string,
  prospectIds?: string[],
): Promise<DecisionMakerOption[]> {
  const supabase = requireSupabase()
  let query = supabase
    .from('decision_makers')
    .select('id, prospect_id, full_name, job_title, email, verification_status')
    .eq('tenant_id', tenantId)
    .order('full_name', { ascending: true })
  if (prospectIds?.length) query = query.in('prospect_id', prospectIds)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function fetchSuppression(tenantId: string): Promise<SuppressionRow[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('suppression_list')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchApprovals(
  tenantId: string,
  messageId?: string,
): Promise<SalesEmailApprovalRow[]> {
  const supabase = requireSupabase()
  let query = supabase
    .from('sales_email_approvals')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (messageId) query = query.eq('message_id', messageId)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function fetchOutbox(tenantId: string): Promise<OutreachOutboxRow[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('outreach_outbox')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** Assemble a draft list without relying on PostgREST relationship joins. */
export async function fetchDraftViews(
  tenantId: string,
  options: { campaignId?: string; statuses?: DraftStatus[] } = {},
): Promise<DraftView[]> {
  const [messages, prospects, decisionMakers] = await Promise.all([
    fetchMessages(tenantId, options),
    fetchProspectOptions(tenantId),
    fetchDecisionMakerOptions(tenantId),
  ])
  const prospectMap = new Map(prospects.map((item) => [item.id, item]))
  const dmMap = new Map(decisionMakers.map((item) => [item.id, item]))
  return messages.map((message) => ({
    message,
    prospect: prospectMap.get(message.prospect_id) ?? null,
    decisionMaker: message.decision_maker_id ? dmMap.get(message.decision_maker_id) ?? null : null,
  }))
}

export async function fetchOutboxViews(tenantId: string): Promise<OutboxItemView[]> {
  const [outbox, messages] = await Promise.all([fetchOutbox(tenantId), fetchMessages(tenantId)])
  const messageMap = new Map(messages.map((item) => [item.id, item]))
  return outbox.map((row) => ({ outbox: row, message: messageMap.get(row.message_id) ?? null }))
}

/** Returns null for the summary if 0019 is not applied yet; never a fake zero. */
export async function fetchCampaignSummary(
  tenantId: string,
  campaignId: string,
): Promise<SalesCampaignSummary | null> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('sales_campaign_summary', {
    p_tenant: tenantId,
    p_campaign: campaignId,
  })
  if (error) return null
  return data ?? null
}

export async function fetchCampaignDetail(
  tenantId: string,
  campaignId: string,
): Promise<CampaignDetail | null> {
  const [campaigns, messages, summary] = await Promise.all([
    fetchCampaigns(tenantId),
    fetchMessages(tenantId, { campaignId }),
    fetchCampaignSummary(tenantId, campaignId),
  ])
  const campaign = campaigns.find((item) => item.id === campaignId)
  if (!campaign) return null
  return { campaign, messages, summary }
}

export async function createCampaign(
  tenantId: string,
  values: CampaignCreateInput,
): Promise<{ campaignId: string; result: string }> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('sales_create_campaign', {
    p_tenant: tenantId,
    p_name: values.name,
    p_objective: values.objective,
    p_tone: values.tone,
    p_product_offered: values.product_offered,
    p_problem_addressed: values.problem_addressed,
    p_prospect_ids: values.prospect_ids as Json,
  })
  if (error) throw error
  if (!data) throw new Error('The campaign could not be created.')
  return {
    campaignId: data.campaign_id,
    result: `${data.recipients_created} draft recipient(s) created` +
      (data.skipped_no_email ? `, ${data.skipped_no_email} skipped (no email)` : '') +
      (data.skipped_suppressed ? `, ${data.skipped_suppressed} skipped (suppressed)` : ''),
  }
}

export type SaveDraftValues = {
  subject: string
  /** The full, editable message body that approval and any future sender uses. */
  body: string
  opening: string | null
  cta: string | null
  followUpSubject: string | null
  followUpBody: string | null
  decisionMakerId: string | null
  generationSource: 'manual' | 'ai'
}

export async function saveEmailDraft(
  tenantId: string,
  messageId: string,
  values: SaveDraftValues,
): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('sales_save_email_draft', {
    p_tenant: tenantId,
    p_message: messageId,
    p_decision_maker: values.decisionMakerId,
    p_subject: values.subject,
    p_body: values.body,
    p_opening: values.opening,
    p_cta: values.cta,
    p_follow_up_subject: values.followUpSubject,
    p_follow_up_body: values.followUpBody,
    p_generation_source: values.generationSource,
  })
  if (error) throw error
}

export async function submitForApproval(tenantId: string, messageId: string): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('sales_submit_for_approval', {
    p_tenant: tenantId,
    p_message: messageId,
  })
  if (error) throw error
}

export async function reviewEmailDraft(
  tenantId: string,
  values: ApprovalDecisionInput,
): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('sales_review_email_draft', {
    p_tenant: tenantId,
    p_message: values.draft_id,
    p_decision: values.decision,
    p_edited_subject: values.edited_subject ?? null,
    p_edited_body: values.edited_body ?? null,
    p_reason: values.reason || null,
  })
  if (error) throw error
}

export async function queueApprovedEmail(tenantId: string, messageId: string): Promise<string> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('sales_queue_approved_email', {
    p_tenant: tenantId,
    p_message: messageId,
  })
  if (error) throw error
  if (!data) throw new Error('The message could not be queued.')
  return data
}

export async function addSuppression(
  tenantId: string,
  email: string,
  reason: 'unsubscribe' | 'bounced' | 'complaint' | 'manual',
  source: string | null,
): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('sales_add_suppression', {
    p_tenant: tenantId,
    p_email: email,
    p_reason: reason,
    p_source: source,
  })
  if (error) throw error
}

export async function markOutboxFailed(
  tenantId: string,
  outboxId: string,
  errorText: string,
): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('sales_mark_outbox_failed', {
    p_tenant: tenantId,
    p_outbox: outboxId,
    p_error: errorText,
  })
  if (error) throw error
}

export async function retryOutbox(tenantId: string, outboxId: string): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('sales_retry_outbox', {
    p_tenant: tenantId,
    p_outbox: outboxId,
  })
  if (error) throw error
}

/**
 * Ask the dedicated Edge Function for a draft. The key stays server-side.
 * The function is intentionally NOT deployed in this phase, so any failure is
 * surfaced as "not available" rather than silently falling back to a fake draft.
 */
export async function requestAiDraft(
  tenantId: string,
  input: EmailDraftInput,
): Promise<GeneratedDraft> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.functions.invoke('sales-email-draft', {
    body: { tenant_id: tenantId, input },
  })
  if (error) {
    const detail = typeof error.message === 'string' ? error.message : ''
    throw new Error(
      'AI draft service is not available. Deploy the sales-email-draft Edge Function and configure its server-side secrets.' +
        (detail ? ` (${detail})` : ''),
    )
  }
  if (!data || typeof data !== 'object') {
    throw new Error('AI draft service returned no draft. Nothing was saved or sent.')
  }
  const payload = data as Record<string, unknown>
  if (payload.error) {
    const nested = payload.error as { message?: unknown }
    const message = typeof nested.message === 'string' ? nested.message : 'AI draft service is not configured.'
    throw new Error(`${message} Nothing was saved or sent.`)
  }
  if (!payload.draft || typeof payload.draft !== 'object') {
    throw new Error('AI draft service returned no draft. Nothing was saved or sent.')
  }
  return payload.draft as unknown as GeneratedDraft
}
