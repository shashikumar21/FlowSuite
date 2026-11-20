import { requireSupabase } from '@/integrations/supabase/client'
import type {
  ChannelRow,
  ContactRow,
  ConversationRow,
  ConversationStatus,
  InboxMetrics,
  Json,
  MessageRow,
  TenantRole,
} from '@/types/database'
import type { NewConversationFormValues, ReplyFormValues } from './schemas'

export type InboxMemberOption = {
  user_id: string
  full_name: string | null
  role: TenantRole
}

export type InboxOptions = {
  channels: ChannelRow[]
  contacts: ContactRow[]
  members: InboxMemberOption[]
}

function firstError(...results: Array<{ error: { message: string } | null }>) {
  return results.find((result) => result.error)?.error ?? null
}

export async function fetchInboxConversations(tenantId: string): Promise<ConversationRow[]> {
  const { data, error } = await requireSupabase()
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .returns<ConversationRow[]>()
  if (error) throw error
  return data ?? []
}

export async function fetchInboxMessages(tenantId: string, conversationId: string): Promise<MessageRow[]> {
  const { data, error } = await requireSupabase()
    .from('messages')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .returns<MessageRow[]>()
  if (error) throw error
  return data ?? []
}

/** Metrics come straight from the RPC; the UI never substitutes local counts. */
export async function fetchInboxMetrics(tenantId: string): Promise<InboxMetrics> {
  const { data, error } = await requireSupabase().rpc('inbox_metrics', { p_tenant: tenantId })
  if (error) throw error
  if (!data) throw new Error('Inbox metrics are unavailable right now.')
  return data
}

/** Channels, contacts and active members needed by the inbox forms and labels. */
export async function fetchInboxOptions(tenantId: string): Promise<InboxOptions> {
  const supabase = requireSupabase()
  const [channels, contacts, members] = await Promise.all([
    supabase
      .from('channels')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .order('name')
      .returns<ChannelRow[]>(),
    supabase
      .from('contacts')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('first_name')
      .limit(200)
      .returns<ContactRow[]>(),
    supabase
      .from('business_members')
      .select('user_id, role, profiles(full_name)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .returns<Array<{ user_id: string; role: TenantRole; profiles: { full_name: string | null } | null }>>(),
  ])
  const error = firstError(channels, contacts, members)
  if (error) throw error

  return {
    channels: channels.data ?? [],
    contacts: contacts.data ?? [],
    members: (members.data ?? []).map((member) => ({
      user_id: member.user_id,
      full_name: member.profiles?.full_name ?? null,
      role: member.role,
    })),
  }
}

export async function createInboxConversation(
  tenantId: string,
  values: NewConversationFormValues,
): Promise<string> {
  const { data, error } = await requireSupabase().rpc('inbox_create_conversation', {
    p_tenant: tenantId,
    p_contact_id: values.contact_id || null,
    p_channel_id: values.channel_id || null,
    p_subject: values.subject || null,
    p_customer_name: values.customer_name || null,
    p_customer_email: values.customer_email || null,
    p_assigned_to: values.assigned_to || null,
  })
  if (error) throw error
  return data
}

export async function assignInboxConversation(
  tenantId: string,
  conversationId: string,
  userId: string,
): Promise<void> {
  const { error } = await requireSupabase().rpc('inbox_assign_conversation', {
    p_tenant: tenantId,
    p_conversation: conversationId,
    p_user_id: userId,
  })
  if (error) throw error
}

export async function setInboxConversationStatus(
  tenantId: string,
  conversationId: string,
  status: ConversationStatus,
): Promise<void> {
  const { error } = await requireSupabase().rpc('inbox_set_conversation_status', {
    p_tenant: tenantId,
    p_conversation: conversationId,
    p_status: status,
  })
  if (error) throw error
}

export async function sendInboxMessage(
  tenantId: string,
  conversationId: string,
  values: ReplyFormValues,
): Promise<string> {
  const { data, error } = await requireSupabase().rpc('inbox_send_message', {
    p_tenant: tenantId,
    p_conversation: conversationId,
    p_content: values.content,
    p_message_type: 'text',
    p_is_internal: values.is_internal,
  })
  if (error) throw error
  return data
}

export async function markInboxConversationRead(tenantId: string, conversationId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('inbox_mark_read', {
    p_tenant: tenantId,
    p_conversation: conversationId,
  })
  if (error) throw error
}

/**
 * Owner/admin manual reconciliation only. Not called by the inbox UI: in
 * production, provider webhooks are recorded by an Edge Function.
 */
export async function recordInboxWebhook(
  tenantId: string,
  input: { provider: string; event_type: string; external_id: string; payload: Json },
): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc('inbox_record_webhook', {
    p_tenant: tenantId,
    p_provider: input.provider,
    p_event_type: input.event_type,
    p_external_id: input.external_id,
    p_payload: input.payload,
  })
  if (error) throw error
  return data
}
