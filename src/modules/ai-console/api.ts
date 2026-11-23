import { z } from 'zod'
import { requireSupabase } from '@/integrations/supabase/client'
import type {
  AiAgentRow,
  AiAgentToolRow,
  AiToolKey,
  AiClassification,
  AiConsentChannel,
  AiConsentStatus,
  AiFollowUpChannel,
  AiKnowledgeRow,
  AiLeadAssessmentRow,
  AiUsageLogRow,
  AiFollowUpJobRow,
  AiFollowUpSequenceRow,
  AiFollowUpStepRow,
  ChannelCredentialRow,
  ChannelRow,
  CommunicationConsentRow,
  ContactRow,
  ConversationHandoffRow,
  ConversationRow,
  MemberStatus,
  MessageTemplateRow,
  PublicAiAgent,
  TenantRole,
} from '@/types/database'
import type {
  AgentFormValues,
  ConsentFormValues,
  CredentialFormValues,
  HandoffFormValues,
  KnowledgeFormValues,
  TemplateFormValues,
} from './schemas'

export type MemberOption = {
  user_id: string
  role: TenantRole
  status: MemberStatus
  profiles: { full_name: string | null } | null
}

export type ContactOption = Pick<ContactRow, 'id' | 'first_name' | 'last_name' | 'phone'>

export type AiAgentsData = {
  canManage: boolean
  agents: AiAgentRow[]
  tools: AiAgentToolRow[]
  knowledge: AiKnowledgeRow[]
  usage: AiUsageLogRow[]
  members: MemberOption[]
}

export type IntegrationsData = {
  canManage: boolean
  channels: ChannelRow[]
  credentials: ChannelCredentialRow[]
  templates: MessageTemplateRow[]
}

export type AiConversationsData = {
  canManage: boolean
  conversations: ConversationRow[]
  assessments: AiLeadAssessmentRow[]
  handoffs: ConversationHandoffRow[]
  sequences: AiFollowUpSequenceRow[]
  steps: AiFollowUpStepRow[]
  jobs: AiFollowUpJobRow[]
  consents: CommunicationConsentRow[]
  contacts: ContactOption[]
  members: MemberOption[]
}

function requireData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw error
  if (data == null) throw new Error('The request returned no data.')
  return data
}

function requireNoError(error: { message: string } | null): void {
  if (error) throw error
}

async function canManageAi(tenantId: string): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc('can_manage_ai', { p_tenant: tenantId })
  requireNoError(error)
  return data === true
}

export async function fetchAiAgentsData(tenantId: string): Promise<AiAgentsData> {
  const supabase = requireSupabase()
  const [manage, agents, tools, knowledge, usage, members] = await Promise.all([
    canManageAi(tenantId),
    supabase.from('ai_agents').select('*').eq('tenant_id', tenantId).order('created_at').returns<AiAgentRow[]>(),
    supabase.from('ai_agent_tools').select('*').eq('tenant_id', tenantId).returns<AiAgentToolRow[]>(),
    supabase
      .from('ai_agent_knowledge')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .returns<AiKnowledgeRow[]>(),
    supabase
      .from('ai_usage_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(200)
      .returns<AiUsageLogRow[]>(),
    supabase
      .from('business_members')
      .select('user_id, role, status, profiles(full_name)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .returns<MemberOption[]>(),
  ])
  const error = agents.error ?? tools.error ?? knowledge.error ?? usage.error ?? members.error
  if (error) throw error
  return {
    canManage: manage,
    agents: agents.data ?? [],
    tools: tools.data ?? [],
    knowledge: knowledge.data ?? [],
    usage: usage.data ?? [],
    members: members.data ?? [],
  }
}

export async function fetchIntegrationsData(tenantId: string): Promise<IntegrationsData> {
  const supabase = requireSupabase()
  const [manage, channels, credentials, templates] = await Promise.all([
    canManageAi(tenantId),
    supabase.from('channels').select('*').eq('tenant_id', tenantId).order('created_at').returns<ChannelRow[]>(),
    supabase
      .from('channel_credentials')
      .select('*')
      .eq('tenant_id', tenantId)
      .returns<ChannelCredentialRow[]>(),
    supabase
      .from('message_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .returns<MessageTemplateRow[]>(),
  ])
  const error = channels.error ?? credentials.error ?? templates.error
  if (error) throw error
  return {
    canManage: manage,
    channels: channels.data ?? [],
    credentials: credentials.data ?? [],
    templates: templates.data ?? [],
  }
}

export async function fetchAiConversationsData(tenantId: string): Promise<AiConversationsData> {
  const supabase = requireSupabase()
  const [manage, conversations, assessments, handoffs, sequences, steps, jobs, consents, contacts, members] =
    await Promise.all([
      canManageAi(tenantId),
      supabase
        .from('conversations')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('last_message_at', { ascending: false })
        .limit(200)
        .returns<ConversationRow[]>(),
      supabase
        .from('ai_lead_assessments')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(200)
        .returns<AiLeadAssessmentRow[]>(),
      supabase
        .from('conversation_handoffs')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .returns<ConversationHandoffRow[]>(),
      supabase
        .from('ai_follow_up_sequences')
        .select('*')
        .eq('tenant_id', tenantId)
        .returns<AiFollowUpSequenceRow[]>(),
      supabase.from('ai_follow_up_steps').select('*').eq('tenant_id', tenantId).returns<AiFollowUpStepRow[]>(),
      supabase
        .from('ai_follow_up_jobs')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(200)
        .returns<AiFollowUpJobRow[]>(),
      supabase
        .from('communication_consents')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .returns<CommunicationConsentRow[]>(),
      supabase
        .from('contacts')
        .select('id, first_name, last_name, phone')
        .eq('tenant_id', tenantId)
        .order('first_name')
        .returns<ContactOption[]>(),
      supabase
        .from('business_members')
        .select('user_id, role, status, profiles(full_name)')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .returns<MemberOption[]>(),
    ])
  const error =
    conversations.error ??
    assessments.error ??
    handoffs.error ??
    sequences.error ??
    steps.error ??
    jobs.error ??
    consents.error ??
    contacts.error ??
    members.error
  if (error) throw error
  return {
    canManage: manage,
    conversations: conversations.data ?? [],
    assessments: assessments.data ?? [],
    handoffs: handoffs.data ?? [],
    sequences: sequences.data ?? [],
    steps: steps.data ?? [],
    jobs: jobs.data ?? [],
    consents: consents.data ?? [],
    contacts: contacts.data ?? [],
    members: members.data ?? [],
  }
}

export async function fetchPublicAgent(publicKey: string): Promise<PublicAiAgent | null> {
  if (!/^[0-9a-f]{64}$/.test(publicKey)) return null
  const { data, error } = await requireSupabase().rpc('ai_get_public_agent', { p_public_key: publicKey })
  requireNoError(error)
  if (!data || !('agent_id' in data)) return null
  return data as PublicAiAgent
}

export async function saveAgent(tenantId: string, values: AgentFormValues, agentId?: string): Promise<string> {
  const { data, error } = await requireSupabase().rpc('ai_upsert_agent', {
    p_tenant: tenantId,
    p_agent_id: agentId ?? null,
    p_name: values.name,
    p_language: values.language,
    p_tone: values.tone,
    p_response_style: values.response_style,
    p_business_info: values.business_info || null,
    p_monthly_token_limit: values.monthly_token_limit === '' ? null : values.monthly_token_limit,
    p_booking_permission: values.booking_permission,
    p_handoff_user_id: values.handoff_user_id || null,
    p_status: values.status,
  })
  return requireData(data, error)
}

export async function setAgentStatus(tenantId: string, agentId: string, status: 'draft' | 'active' | 'paused'): Promise<void> {
  const { error } = await requireSupabase().rpc('ai_set_agent_status', {
    p_tenant: tenantId,
    p_agent: agentId,
    p_status: status,
  })
  requireNoError(error)
}

export async function saveKnowledge(tenantId: string, values: KnowledgeFormValues, knowledgeId?: string): Promise<string> {
  const { data, error } = await requireSupabase().rpc('ai_upsert_knowledge', {
    p_tenant: tenantId,
    p_knowledge_id: knowledgeId ?? null,
    p_agent: values.agent_id,
    p_category: values.category,
    p_title: values.title,
    p_content: values.content,
    p_language: values.language,
    p_active: values.active,
  })
  return requireData(data, error)
}

export async function setAgentTool(
  tenantId: string,
  agentId: string,
  toolKey: AiToolKey,
  enabled: boolean,
  requiresConfirmation: boolean,
): Promise<void> {
  const { error } = await requireSupabase().rpc('ai_set_tool', {
    p_tenant: tenantId,
    p_agent: agentId,
    p_tool_key: toolKey,
    p_enabled: enabled,
    p_requires_confirmation: requiresConfirmation,
  })
  requireNoError(error)
}

export async function saveCredential(tenantId: string, values: CredentialFormValues): Promise<string> {
  const { data, error } = await requireSupabase().rpc('ai_upsert_credential', {
    p_tenant: tenantId,
    p_channel: values.channel_id,
    p_provider: values.provider,
    p_secret_ref: values.secret_ref,
    p_external_identifier: values.external_identifier || null,
  })
  return requireData(data, error)
}

export async function saveTemplate(tenantId: string, values: TemplateFormValues): Promise<string> {
  const { data, error } = await requireSupabase().rpc('ai_upsert_template', {
    p_tenant: tenantId,
    p_template_key: values.template_key,
    p_content: values.content,
    p_provider: values.provider,
    p_provider_template_name: values.provider_template_name || null,
    p_language: values.language,
    p_category: values.category,
    p_status: values.status,
  })
  return requireData(data, error)
}

export async function setConsent(
  tenantId: string,
  contactId: string,
  values: ConsentFormValues,
): Promise<string> {
  const { data, error } = await requireSupabase().rpc('ai_set_consent', {
    p_tenant: tenantId,
    p_contact: contactId,
    p_channel: values.channel as AiConsentChannel,
    p_status: values.status as AiConsentStatus,
    p_source: values.source,
  })
  return requireData(data, error)
}

export async function recordAssessment(input: {
  tenantId: string
  contactId: string
  classification: AiClassification
  summary: string
  conversationId?: string | null
}): Promise<string> {
  const { data, error } = await requireSupabase().rpc('ai_record_assessment', {
    p_tenant: input.tenantId,
    p_contact: input.contactId,
    p_classification: input.classification,
    p_summary: input.summary,
    p_conversation: input.conversationId ?? null,
  })
  return requireData(data, error)
}

export async function handoffConversation(
  tenantId: string,
  conversationId: string,
  values: HandoffFormValues,
): Promise<string> {
  const { data, error } = await requireSupabase().rpc('ai_handoff_conversation', {
    p_tenant: tenantId,
    p_conversation: conversationId,
    p_to_user: values.to_user,
    p_reason: values.reason || null,
    p_note: values.note || null,
  })
  return requireData(data, error)
}

export async function setConversationAiStatus(
  tenantId: string,
  conversationId: string,
  status: 'active' | 'paused' | 'closed',
): Promise<void> {
  const { error } = await requireSupabase().rpc('ai_set_conversation_ai_status', {
    p_tenant: tenantId,
    p_conversation: conversationId,
    p_status: status,
  })
  requireNoError(error)
}

export async function enqueueFollowUp(input: {
  tenantId: string
  contactId: string
  sequenceId: string
  channel: AiFollowUpChannel
  conversationId?: string | null
}): Promise<string> {
  const { data, error } = await requireSupabase().rpc('ai_enqueue_follow_up', {
    p_tenant: input.tenantId,
    p_contact: input.contactId,
    p_sequence: input.sequenceId,
    p_channel: input.channel,
    p_conversation: input.conversationId ?? null,
  })
  return requireData(data, error)
}

const integrationSecretMetaSchema = z.object({
  id: z.string().uuid(),
  provider: z.enum(['openai', 'whatsapp', 'resend', 'exotel', 'netlify', 'vercel', 'other']),
  secret_name: z.string().regex(/^[A-Z][A-Z0-9_]{2,199}$/),
  status: z.enum(['connected', 'disconnected', 'error']),
  last_verified_at: z.string().nullable(),
  last_error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

const integrationSecretMetaListSchema = z.array(integrationSecretMetaSchema)

export type IntegrationSecretMeta = z.infer<typeof integrationSecretMetaSchema>

export async function listIntegrationSecrets(tenantId: string): Promise<IntegrationSecretMeta[]> {
  const { data, error } = await requireSupabase().rpc('integrations_list_secret_meta' as never, { p_tenant: tenantId } as never)
  if (error) throw error
  return integrationSecretMetaListSchema.parse(data ?? [])
}

export async function saveIntegrationSecret(input: {
  tenantId: string
  provider: string
  secretName: string
  secretValue: string
}): Promise<void> {
  const { error } = await requireSupabase().functions.invoke('integrations-vault-save', {
    body: {
      tenant_id: input.tenantId,
      provider: input.provider,
      secret_name: input.secretName,
      secret_value: input.secretValue,
    },
  })
  if (error) throw error
}

export async function disconnectIntegrationSecret(tenantId: string, provider: string, secretName: string): Promise<void> {
  const { error } = await requireSupabase().rpc('integrations_disconnect_secret' as never, {
    p_tenant: tenantId, p_provider: provider, p_secret_name: secretName,
  } as never)
  if (error) throw error
}
