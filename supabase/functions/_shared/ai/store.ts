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
import type {
  FollowUpJob,
  FollowUpStore,
} from './follow_up.ts';
import type {
  Classification,
  FollowUpChannel,
  QualificationStore,
} from './qualification.ts';
import type { VoiceStore, VoiceProvider, VoiceCallStatus } from './voice.ts';
import type { WhatsAppInboundStore } from './whatsapp_inbound.ts';
import type { WhatsAppMessagingState } from './whatsapp_send.ts';

type StoreClient = SupabaseClient;
export type AiStore = WhatsAppInboundStore & QualificationStore & FollowUpStore;

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

function toFollowUpJob(value: unknown): FollowUpJob | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.job_id !== 'string' || typeof record.tenant_id !== 'string') return null;
  const rawTemplate = record.template;
  let template: FollowUpJob['template'] = null;
  if (rawTemplate && typeof rawTemplate === 'object') {
    const value = rawTemplate as Record<string, unknown>;
    if (typeof value.key === 'string' && typeof value.content === 'string') {
      template = {
        key: value.key,
        providerName: typeof value.provider_name === 'string' ? value.provider_name : null,
        content: value.content,
        language: typeof value.language === 'string' ? value.language : 'en',
      };
    }
  }
  return {
    jobId: record.job_id,
    tenantId: record.tenant_id,
    contactId: String(record.contact_id ?? ''),
    conversationId: typeof record.conversation_id === 'string' ? record.conversation_id : null,
    channel: typeof record.channel === 'string' ? record.channel : '',
    idempotencyKey: typeof record.idempotency_key === 'string' ? record.idempotency_key : '',
    contactName: typeof record.contact_name === 'string' ? record.contact_name.trim() : null,
    contactPhone: typeof record.contact_phone === 'string' ? record.contact_phone : null,
    contactMobile: typeof record.contact_mobile === 'string' ? record.contact_mobile : null,
    template,
  };
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
export function createAiStore(client: StoreClient): AiStore {
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

    markMessageDelivered: async (input: {
      tenantId: string;
      messageId: string;
      providerMessageId: string;
    }): Promise<boolean> => {
      return rpc<boolean>(client, 'ai_service_mark_message_delivered', {
        p_tenant: input.tenantId,
        p_message: input.messageId,
        p_provider_message_id: input.providerMessageId,
      });
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

    recordAssessment: async (input: {
      tenantId: string;
      contactId: string;
      conversationId: string | null;
      classification: Classification;
      summary: string;
      intent: string | null;
      serviceInterest: string | null;
      provider: string;
      model: string | null;
    }): Promise<string> => {
      return rpc<string>(client, 'ai_service_record_assessment', {
        p_tenant: input.tenantId,
        p_contact: input.contactId,
        p_classification: input.classification,
        p_summary: input.summary,
        p_intent: input.intent,
        p_service_interest: input.serviceInterest,
        p_follow_up_recommendation: null,
        p_conversation: input.conversationId,
        p_message: null,
        p_provider: input.provider,
        p_model: input.model,
      });
    },

    getActiveFollowUpSequence: async (tenantId: string): Promise<string | null> => {
      const { data, error } = await client
        .from('ai_follow_up_sequences')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .order('created_at')
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return typeof data?.id === 'string' ? data.id : null;
    },

    enqueueFollowUp: async (input: {
      tenantId: string;
      contactId: string;
      sequenceId: string;
      channel: FollowUpChannel;
      conversationId: string | null;
    }): Promise<string | null> => {
      try {
        return await rpc<string>(client, 'ai_service_enqueue_follow_up', {
          p_tenant: input.tenantId,
          p_contact: input.contactId,
          p_sequence: input.sequenceId,
          p_channel: input.channel,
          p_conversation: input.conversationId,
        });
      } catch {
        // Consent and automation pauses are enforced by the RPC. A skipped
        // enqueue is not a qualification failure.
        return null;
      }
    },

    claimJob: async (jobId: string): Promise<FollowUpJob | null> => {
      const value = await rpc<unknown>(client, 'ai_claim_follow_up_job', { p_job: jobId });
      return toFollowUpJob(value);
    },

    completeJob: async (input: {
      jobId: string;
      status: 'sent' | 'skipped' | 'failed';
      providerMessageId?: string | null;
      error?: string | null;
    }): Promise<void> => {
      await rpc<void>(client, 'ai_complete_follow_up_job', {
        p_job: input.jobId,
        p_status: input.status,
        p_provider_message_id: input.providerMessageId ?? null,
        p_error: input.error ?? null,
      });
    },

    getWhatsappCredentialForTenant: async (
      tenantId: string
    ): Promise<{ phoneNumberId: string; secretRef: string } | null> => {
      const { data: credentials, error } = await client
        .from('channel_credentials')
        .select('channel_id, secret_ref, external_identifier')
        .eq('tenant_id', tenantId)
        .eq('provider', 'whatsapp')
        .eq('status', 'active');
      if (error) throw new Error(error.message);
      for (const credential of credentials ?? []) {
        const { data: channel, error: channelError } = await client
          .from('channels')
          .select('id')
          .eq('id', credential.channel_id as string)
          .eq('tenant_id', tenantId)
          .eq('channel_type', 'whatsapp')
          .eq('active', true)
          .maybeSingle();
        if (channelError) throw new Error(channelError.message);
        if (channel && typeof credential.secret_ref === 'string' && typeof credential.external_identifier === 'string') {
          return { phoneNumberId: credential.external_identifier, secretRef: credential.secret_ref };
        }
      }
      return null;
    },
  };
}

/** Resolves the website-chat agent from its public key. */
export async function getWebsiteAgent(client: StoreClient, publicKey: string): Promise<AgentContext | null> {
  const value = await rpc<unknown>(client, 'ai_service_get_agent', { p_public_key: publicKey });
  return toAgentContext(value);
}

/** Voice foundation store. No audio or provider credentials are involved. */
export function createVoiceStore(client: StoreClient): VoiceStore {
  return {
    resolveTenantForAccount: async (
      provider: VoiceProvider,
      accountId: string
    ): Promise<string | null> => {
      const { data, error } = await client
        .from('channel_credentials')
        .select('tenant_id')
        .eq('provider', provider)
        .eq('external_identifier', accountId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return typeof data?.tenant_id === 'string' ? data.tenant_id : null;
    },

    recordWebhookEvent: async (input: {
      tenantId: string;
      provider: VoiceProvider;
      externalId: string;
      payload: Record<string, unknown>;
    }): Promise<AiWebhookEventResult> => {
      return rpc<AiWebhookEventResult>(client, 'ai_record_webhook_event', {
        p_tenant: input.tenantId,
        p_provider: input.provider,
        p_event_type: 'call',
        p_external_id: input.externalId,
        p_payload: toJson(input.payload),
        p_signature_verified: true,
      });
    },

    upsertCallSession: async (input: {
      tenantId: string;
      provider: VoiceProvider;
      callId: string;
      from: string | null;
      to: string | null;
      direction: 'inbound' | 'outbound';
      status: VoiceCallStatus;
      metadata: Record<string, unknown>;
    }): Promise<string> => {
      return rpc<string>(client, 'ai_upsert_call_session', {
        p_tenant: input.tenantId,
        p_provider: input.provider,
        p_provider_call_id: input.callId,
        p_direction: input.direction,
        p_from_number: input.from,
        p_to_number: input.to,
        p_status: input.status,
        p_metadata: toJson(input.metadata),
      });
    },

    recordCallLog: async (input: {
      tenantId: string;
      sessionId: string;
      outcome: string;
    }): Promise<void> => {
      const { error } = await client
        .from('ai_call_logs')
        .insert({
          tenant_id: input.tenantId,
          session_id: input.sessionId,
          outcome: input.outcome,
          summary: null,
          duration_seconds: null,
          usage: {},
          error: null,
        });
      if (error) throw new Error(error.message);
    },
  };
}
