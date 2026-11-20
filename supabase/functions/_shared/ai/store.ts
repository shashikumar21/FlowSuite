// Server-only Supabase adapter for Edge Functions. The service-role key is
// injected by the entry point; it is never exposed to browser code.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { UsageRecord } from '../../../../src/modules/ai/usage.ts';
import type { AiWebhookEventResult, Json } from '../../../../src/types/database.ts';
import type {
  AgentContext,
  AppendMessageInput,
  ChatChannel,
  ChatIdentity,
} from './chat.ts';
import type { WhatsAppInboundStore } from './whatsapp_inbound.ts';
import type { WhatsAppMessagingState } from './whatsapp_send.ts';

type StoreClient = SupabaseClient;

export function createServiceClient(url: string, serviceRoleKey: string): StoreClient {
  if (!url?.trim() || !serviceRoleKey?.trim()) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'flowSuite-edge' } },
  });
}

async function rpc<T>(client: StoreClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function toJson(value: Record<string, unknown> | undefined): Json {
  return (value ?? {}) as Json;
}

function toAgentContext(value: unknown): AgentContext | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.agent_id !== 'string' || typeof record.tenant_id !== 'string') return null;
  return record as unknown as AgentContext;
}

async function hasOpenWhatsAppSession(
  client: StoreClient,
  tenantId: string,
  contactId: string
): Promise<boolean> {
  const { data: conversations, error: conversationError } = await client
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('contact_id', contactId);
  if (conversationError) throw new Error(conversationError.message);
  const ids = (conversations ?? []).map((row) => row.id as string);
  if (ids.length === 0) return false;

  const { data: messages, error: messageError } = await client
    .from('messages')
    .select('created_at')
    .eq('tenant_id', tenantId)
    .eq('direction', 'inbound')
    .in('conversation_id', ids)
    .order('created_at', { ascending: false })
    .limit(1);
  if (messageError) throw new Error(messageError.message);
  const latest = messages?.[0]?.created_at;
  if (typeof latest !== 'string') return false;
  const age = Date.now() - Date.parse(latest);
  return Number.isFinite(age) && age >= 0 && age < 24 * 60 * 60 * 1000;
}

async function getActiveHandoffUser(client: StoreClient, tenantId: string): Promise<string | null> {
  const { data, error } = await client
    .from('ai_agents')
    .select('handoff_user_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return typeof data?.handoff_user_id === 'string' ? data.handoff_user_id : null;
}

/** Builds the injected store used by chat.ts and whatsapp_inbound.ts. */
export function createAiStore(client: StoreClient): WhatsAppInboundStore {
  return {
    resolveChannelId: async (tenantId: string, channelType: ChatChannel): Promise<string | null> => {
      const { data, error } = await client
        .from('channels')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('channel_type', channelType)
        .eq('active', true)
        .order('created_at')
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return typeof data?.id === 'string' ? data.id : null;
    },

    upsertContact: async (tenantId: string, channel: ChatChannel, identity: ChatIdentity): Promise<string> => {
      return rpc<string>(client, 'ai_upsert_contact_from_channel', {
        p_tenant: tenantId,
        p_channel: channel,
        p_full_name: identity.name ?? null,
        p_phone: identity.phone ?? null,
        p_email: identity.email ?? null,
      });
    },

    findOrCreateConversation: async (tenantId: string, contactId: string, channelId: string): Promise<string> => {
      return rpc<string>(client, 'ai_find_or_create_conversation', {
        p_tenant: tenantId,
        p_contact: contactId,
        p_channel: channelId,
      });
    },

    appendMessage: async (input: AppendMessageInput): Promise<string> => {
      return rpc<string>(client, 'ai_append_message', {
        p_tenant: input.tenantId,
        p_conversation: input.conversationId,
        p_direction: input.direction,
        p_content: input.content,
        p_author_type: input.authorType,
        p_external_id: input.externalId ?? null,
        p_ai_generated: input.aiGenerated ?? false,
        p_metadata: toJson(input.metadata),
      });
    },

    checkUsageLimit: async (tenantId: string, agentId: string): Promise<boolean> => {
      return rpc<boolean>(client, 'ai_service_check_usage_limit', {
        p_tenant: tenantId,
        p_agent: agentId,
      });
    },

    recordUsage: async (record: UsageRecord): Promise<void> => {
      await rpc<string>(client, 'ai_record_usage', {
        p_tenant: record.tenantId,
        p_agent: record.agentId,
        p_conversation: record.conversationId,
        p_channel: record.channel,
        p_provider: record.provider,
        p_model: record.model,
        p_operation: record.operation,
        p_prompt_tokens: record.promptTokens,
        p_completion_tokens: record.completionTokens,
        p_estimated_cost: record.estimatedCost,
        p_latency_ms: record.latencyMs,
        p_success: record.success,
        p_error_code: record.errorCode,
        p_request_id: record.requestId,
      });
    },

    requestHandoff: async (input: { tenantId: string; conversationId: string; reason: string }): Promise<void> => {
      const target = await getActiveHandoffUser(client, input.tenantId);
      if (!target) return;
      await rpc<string>(client, 'ai_service_handoff_conversation', {
        p_tenant: input.tenantId,
        p_conversation: input.conversationId,
        p_to_user: target,
        p_reason: input.reason,
        p_note: null,
      });
    },

    recordConsent: async (input: {
      tenantId: string;
      contactId: string;
      source: 'website_chat' | 'whatsapp';
      proof: Record<string, unknown>;
    }): Promise<void> => {
      await rpc<string>(client, 'ai_service_set_consent', {
        p_tenant: input.tenantId,
        p_contact: input.contactId,
        p_channel: 'whatsapp',
        p_status: 'opt_in',
        p_source: input.source,
        p_proof: toJson(input.proof),
      });
    },

    resolveTenantForPhoneNumber: async (phoneNumberId: string): Promise<string | null> => {
      const { data, error } = await client
        .from('channel_credentials')
        .select('tenant_id')
        .eq('provider', 'whatsapp')
        .eq('external_identifier', phoneNumberId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return typeof data?.tenant_id === 'string' ? data.tenant_id : null;
    },

    getCredentialSecretRef: async (tenantId: string, phoneNumberId: string): Promise<string | null> => {
      const { data, error } = await client
        .from('channel_credentials')
        .select('secret_ref')
        .eq('tenant_id', tenantId)
        .eq('provider', 'whatsapp')
        .eq('external_identifier', phoneNumberId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return typeof data?.secret_ref === 'string' ? data.secret_ref : null;
    },

    getActiveAgent: async (tenantId: string): Promise<AgentContext | null> => {
      const value = await rpc<unknown>(client, 'ai_service_get_active_agent', { p_tenant: tenantId });
      return toAgentContext(value);
    },

    recordWebhookEvent: async (input: {
      tenantId: string;
      externalId: string;
      payload: Record<string, unknown>;
    }): Promise<AiWebhookEventResult> => {
      return rpc<AiWebhookEventResult>(client, 'ai_record_webhook_event', {
        p_tenant: input.tenantId,
        p_provider: 'whatsapp',
        p_event_type: 'message',
        p_external_id: input.externalId,
        p_payload: toJson(input.payload),
        p_signature_verified: true,
      });
    },

    getMessagingState: async (tenantId: string, contactId: string): Promise<WhatsAppMessagingState> => {
      const { data: consent, error } = await client
        .from('communication_consents')
        .select('status, revoked_at')
        .eq('tenant_id', tenantId)
        .eq('contact_id', contactId)
        .eq('channel', 'whatsapp')
        .maybeSingle();
      if (error) throw new Error(error.message);
      const optedOut = consent?.status === 'opt_out' || consent?.revoked_at != null;
      const consented = consent?.status === 'opt_in' && consent?.revoked_at == null;
      const sessionOpen = await hasOpenWhatsAppSession(client, tenantId, contactId);
      return { sessionOpen, optedOut, consented };
    },
  };
}

/** Resolves the website-chat agent from its public key. */
export async function getWebsiteAgent(client: StoreClient, publicKey: string): Promise<AgentContext | null> {
  const value = await rpc<unknown>(client, 'ai_service_get_agent', { p_public_key: publicKey });
  return toAgentContext(value);
}
