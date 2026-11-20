// Server-only chatbot orchestration. All I/O is injected so this module can be
// unit tested without Supabase, Deno, provider keys or network access.

import { AiProviderError } from '../../../../src/modules/ai/providers/errors.ts';
import type { AiProvider } from '../../../../src/modules/ai/providers/types.ts';
import { buildSystemPrompt, CHAT_RESPONSE_SCHEMA, isClinicalQuestion } from '../../../../src/modules/ai/safety.ts';
import { buildUsageRecord, requireUsageAllowance, type UsageRecord } from '../../../../src/modules/ai/usage.ts';
import type { AiChannel, PublicAiAgent } from '../../../../src/types/database.ts';

export type ChatChannel = Extract<AiChannel, 'website_chat' | 'whatsapp'>;

/** Public-safe config plus the server-only identifiers needed for tenant scoping. */
export type AgentContext = PublicAiAgent & {
  tenant_id: string;
  public_key: string;
  /** Optional because the public-safe RPC intentionally omits raw config. */
  working_hours?: unknown;
  handoff_user_id?: string | null;
};

export interface ChatIdentity {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AppendMessageInput {
  tenantId: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  content: string;
  authorType: 'customer' | 'bot' | 'staff' | 'system';
  externalId?: string | null;
  aiGenerated?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ChatStore {
  resolveChannelId(tenantId: string, channelType: ChatChannel): Promise<string | null>;
  upsertContact(tenantId: string, channel: ChatChannel, identity: ChatIdentity): Promise<string>;
  findOrCreateConversation(tenantId: string, contactId: string, channelId: string): Promise<string>;
  appendMessage(input: AppendMessageInput): Promise<string>;
  checkUsageLimit(tenantId: string, agentId: string): Promise<boolean>;
  recordUsage(record: UsageRecord): Promise<void>;
  requestHandoff?(input: { tenantId: string; conversationId: string; reason: string }): Promise<void>;
  recordConsent?(input: {
    tenantId: string;
    contactId: string;
    source: 'website_chat' | 'whatsapp';
    proof: Record<string, unknown>;
  }): Promise<void>;
}

export interface AgentReplyInput {
  agent: AgentContext;
  channel: ChatChannel;
  identity: ChatIdentity;
  /** Reuse a contact already resolved by the caller (e.g. WhatsApp webhook). */
  contactId?: string;
  message: string;
  history?: ChatHistoryMessage[];
  provider: AiProvider;
  store: ChatStore;
  requestId?: string;
  consentToWhatsapp?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AgentReplyResult {
  reply: string;
  needsHandoff: boolean;
  escalatedForSafety: boolean;
  conversationId: string;
  inboundMessageId: string;
  outboundMessageId: string;
  provider?: string;
  model?: string;
}

export class ChatError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'ChatError';
    this.code = code;
    this.status = status;
  }
}

const ESCALATION_REPLIES: Record<PublicAiAgent['language'], string> = {
  en: 'A team member will help you with that. Please share your concern with them directly — I cannot advise on symptoms or treatment.',
  hi: 'इसमें एक टीम सदस्य आपकी मदद करेगा। कृपया अपनी समस्या सीधे उनके साथ साझा करें — मैं लक्षणों या इलाज पर सलाह नहीं दे सकता।',
  te: 'దీనిలో ఒక టీమ్ సభ్యుడు మీకు సహాయం చేస్తారు. దయచేసి మీ సమస్యను వారితో నేరుగా చెప్పండి — నేను లక్షణాలు లేదా చికిత్సపై సలహా ఇవ్వలేను.',
};

function errorCode(error: unknown): string {
  if (error instanceof AiProviderError) return error.code;
  if (error instanceof ChatError) return error.code;
  return 'handler_failed';
}

function parseStructuredReply(completion: { parsed: unknown; content: string }): { reply: string; needsHandoff: boolean } {
  const candidate = completion.parsed ?? (() => {
    try {
      return JSON.parse(completion.content) as unknown;
    } catch {
      return null;
    }
  })();
  if (!candidate || typeof candidate !== 'object') {
    throw new AiProviderError('AI reply was not structured output', { code: 'schema_mismatch' });
  }
  const value = candidate as Record<string, unknown>;
  const reply = typeof value.reply === 'string' ? value.reply.trim().slice(0, 4000) : '';
  if (!reply) {
    throw new AiProviderError('AI reply contained no message', { code: 'invalid_response' });
  }
  return {
    reply,
    needsHandoff: value.needs_handoff === true,
  };
}

/**
 * Persists the inbound message, asks the configured provider for one strict
 * JSON reply, then persists the outbound message. Clinical questions never
 * reach the provider; they get a fixed escalation reply and handoff signal.
 */
export async function runAgentReply(input: AgentReplyInput): Promise<AgentReplyResult> {
  const { agent, channel, identity, provider, store } = input;
  const message = input.message?.trim();
  if (!message || message.length > 4000) {
    throw new ChatError('invalid_message', 'Message must be between 1 and 4000 characters');
  }

  const channelId = await store.resolveChannelId(agent.tenant_id, channel);
  if (!channelId) {
    throw new ChatError('channel_unavailable', `No active ${channel} channel for this business`, 503);
  }

  const contactId = input.contactId ?? await store.upsertContact(agent.tenant_id, channel, identity);
  const conversationId = await store.findOrCreateConversation(agent.tenant_id, contactId, channelId);
  const inboundExternalId = typeof input.metadata?.externalMessageId === 'string'
    ? input.metadata.externalMessageId
    : input.requestId ?? null;
  const inboundMessageId = await store.appendMessage({
    tenantId: agent.tenant_id,
    conversationId,
    direction: 'inbound',
    content: message,
    authorType: 'customer',
    externalId: inboundExternalId,
    metadata: { channel, ...input.metadata },
  });

  if (input.consentToWhatsapp && identity.phone) {
    await store.recordConsent?.({
      tenantId: agent.tenant_id,
      contactId,
      source: channel === 'website_chat' ? 'website_chat' : 'whatsapp',
      proof: { requestId: input.requestId ?? null, channel },
    });
  }

  const safetyEscalation = isClinicalQuestion(message);
  let reply = ESCALATION_REPLIES[agent.language];
  let needsHandoff = safetyEscalation;
  let completion: Awaited<ReturnType<AiProvider['complete']>> | null = null;

  if (!safetyEscalation) {
    const history = (input.history ?? [])
      .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
      .slice(-10)
      .map((item) => ({
        role: item.role,
        content: item.content.trim().slice(0, 4000),
      }))
      .filter((item) => item.content.length > 0);

    const systemPrompt = buildSystemPrompt({
      businessName: agent.business_name ?? agent.name,
      businessInfo: agent.business_info,
      workingHours: typeof agent.working_hours === 'object' && agent.working_hours !== null
        ? JSON.stringify(agent.working_hours)
        : null,
      language: agent.language,
      tone: agent.tone,
      responseStyle: agent.response_style,
      knowledge: agent.knowledge.map((item) => `${item.title}: ${item.content}`),
      allowedTools: agent.tools,
      bookingEnabled: agent.booking_permission,
    });

    try {
      await requireUsageAllowance(agent.tenant_id, agent.agent_id, store.checkUsageLimit);
      completion = await provider.complete({
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: message },
        ],
        language: agent.language,
        responseFormat: { name: 'chat_reply', schema: CHAT_RESPONSE_SCHEMA, strict: true },
        requestId: input.requestId,
      });
      const parsed = parseStructuredReply(completion);
      reply = parsed.reply;
      needsHandoff = parsed.needsHandoff || isClinicalQuestion(reply);
    } catch (error) {
      await store.recordUsage(buildUsageRecord({
        tenantId: agent.tenant_id,
        agentId: agent.agent_id,
        conversationId,
        channel,
        operation: 'chat',
        provider: provider.id,
        errorCode: errorCode(error),
        requestId: input.requestId,
      }));
      throw error;
    }

    await store.recordUsage(buildUsageRecord({
      tenantId: agent.tenant_id,
      agentId: agent.agent_id,
      conversationId,
      channel,
      operation: 'chat',
      provider: provider.id,
      completion,
      requestId: input.requestId,
    }));
  }

  const outboundMessageId = await store.appendMessage({
    tenantId: agent.tenant_id,
    conversationId,
    direction: 'outbound',
    content: reply,
    authorType: 'bot',
    aiGenerated: true,
    metadata: {
      channel,
      provider: completion ? provider.id : 'safety',
      model: completion?.model ?? null,
      requestId: input.requestId ?? null,
    },
  });

  if (needsHandoff) {
    await store.requestHandoff?.({
      tenantId: agent.tenant_id,
      conversationId,
      reason: safetyEscalation ? 'clinical_question' : 'ai_requested_handoff',
    });
  }

  return {
    reply,
    needsHandoff,
    escalatedForSafety: safetyEscalation,
    conversationId,
    inboundMessageId,
    outboundMessageId,
    provider: completion ? provider.id : undefined,
    model: completion?.model,
  };
}
