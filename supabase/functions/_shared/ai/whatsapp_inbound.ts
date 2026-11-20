// Server-only WhatsApp inbound orchestration. Signature verification happens
// in the webhook entry point before these records reach this module.

import type { AiWebhookEventResult } from '../../../../src/types/database.ts';
import { runAgentReply, type AgentContext, type ChatStore } from './chat.ts';
import { sendWhatsAppMessage, WhatsAppSendError, type WhatsAppMessagingState } from './whatsapp_send.ts';
import type { WhatsAppInboundMessage } from './whatsapp.ts';

export interface WhatsAppInboundStore extends ChatStore {
  resolveTenantForPhoneNumber(phoneNumberId: string): Promise<string | null>;
  getActiveAgent(tenantId: string): Promise<AgentContext | null>;
  recordWebhookEvent(input: {
    tenantId: string;
    externalId: string;
    payload: Record<string, unknown>;
  }): Promise<AiWebhookEventResult>;
  getMessagingState(tenantId: string, contactId: string): Promise<WhatsAppMessagingState>;
  getCredentialSecretRef(tenantId: string, phoneNumberId: string): Promise<string | null>;
  findContactId?(tenantId: string, phone: string): Promise<string | null>;
}

export interface WhatsAppInboundInput {
  messages: WhatsAppInboundMessage[];
  store: WhatsAppInboundStore;
  provider: Parameters<typeof runAgentReply>[0]['provider'];
  /** Server-only resolver; reads Supabase secrets, never VITE_* values. */
  resolveAccessToken: (tenantId: string, secretRef: string | null) => string;
  fetchImpl?: typeof fetch;
}

export type WhatsAppInboundStatus = 'replied' | 'stored' | 'skipped' | 'failed';

export interface WhatsAppInboundOutcome {
  externalMessageId: string;
  status: WhatsAppInboundStatus;
  reason?: string;
  conversationId?: string;
  providerMessageId?: string | null;
}

function reasonFor(error: unknown): string {
  if (error instanceof WhatsAppSendError) return error.code;
  if (error instanceof Error) return error.message.slice(0, 200);
  return 'unknown_error';
}

async function storeInboundOnly(input: {
  store: WhatsAppInboundStore;
  tenantId: string;
  phone: string;
  name: string | null;
  externalId: string;
  text: string;
}): Promise<string> {
  const { store, tenantId, phone, name, externalId, text } = input;
  const channelId = await store.resolveChannelId(tenantId, 'whatsapp');
  if (!channelId) throw new Error('whatsapp_channel_unavailable');
  const contactId = await store.upsertContact(tenantId, 'whatsapp', { name, phone });
  const conversationId = await store.findOrCreateConversation(tenantId, contactId, channelId);
  await store.appendMessage({
    tenantId,
    conversationId,
    direction: 'inbound',
    content: text,
    authorType: 'customer',
    externalId,
    metadata: { channel: 'whatsapp', externalMessageId: externalId },
  });
  return conversationId;
}

/**
 * Deduplicates by Meta message ID, stores the inbound row, and only sends an
 * AI reply when an active agent exists and the contact has not opted out.
 */
export async function processWhatsAppInbound(
  input: WhatsAppInboundInput
): Promise<WhatsAppInboundOutcome[]> {
  const { messages, store, provider, resolveAccessToken, fetchImpl } = input;
  const outcomes: WhatsAppInboundOutcome[] = [];

  for (const message of messages) {
    const externalId = message.externalMessageId;
    if (!message.tenantId) {
      outcomes.push({ externalMessageId: externalId, status: 'skipped', reason: 'tenant_not_mapped' });
      continue;
    }

    try {
      const event = await store.recordWebhookEvent({
        tenantId: message.tenantId,
        externalId: `message:${externalId}`,
        payload: message as unknown as Record<string, unknown>,
      });
      if (event.is_duplicate) {
        outcomes.push({ externalMessageId: externalId, status: 'skipped', reason: 'duplicate_event' });
        continue;
      }
      if (!message.text) {
        outcomes.push({ externalMessageId: externalId, status: 'skipped', reason: 'non_text_message' });
        continue;
      }

      const normalizedPhone = message.from.replace(/[^\d]/g, '');
      if (normalizedPhone.length < 8 || normalizedPhone.length > 15) {
        outcomes.push({ externalMessageId: externalId, status: 'skipped', reason: 'invalid_sender' });
        continue;
      }
      const to = normalizedPhone.startsWith('91') ? `+${normalizedPhone}` : `+91${normalizedPhone}`;
      const identity = { name: message.contactName, phone: to };

      const contactId = store.findContactId
        ? await store.findContactId(message.tenantId, to)
        : await store.upsertContact(message.tenantId, 'whatsapp', identity);
      const state = contactId
        ? await store.getMessagingState(message.tenantId, contactId)
        : { sessionOpen: true, optedOut: false, consented: false };

      if (state.optedOut) {
        const conversationId = await storeInboundOnly({
          store,
          tenantId: message.tenantId,
          phone: to,
          name: message.contactName,
          externalId,
          text: message.text,
        });
        outcomes.push({ externalMessageId: externalId, status: 'stored', reason: 'opted_out', conversationId });
        continue;
      }

      const agent = await store.getActiveAgent(message.tenantId);
      if (!agent) {
        const conversationId = await storeInboundOnly({
          store,
          tenantId: message.tenantId,
          phone: to,
          name: message.contactName,
          externalId,
          text: message.text,
        });
        outcomes.push({ externalMessageId: externalId, status: 'stored', reason: 'no_active_agent', conversationId });
        continue;
      }

      const secretRef = await store.getCredentialSecretRef(message.tenantId, message.phoneNumberId);
      const accessToken = resolveAccessToken(message.tenantId, secretRef);
      if (!accessToken) {
        outcomes.push({ externalMessageId: externalId, status: 'failed', reason: 'whatsapp_not_configured' });
        continue;
      }

      const reply = await runAgentReply({
        agent,
        channel: 'whatsapp',
        identity,
        contactId: contactId ?? undefined,
        message: message.text,
        provider,
        store,
        requestId: externalId,
        metadata: { externalMessageId: externalId, phoneNumberId: message.phoneNumberId },
      });

      const sent = await sendWhatsAppMessage({
        tenantId: message.tenantId,
        contactId: contactId ?? '',
        to,
        content: reply.reply,
        accessToken,
        phoneNumberId: message.phoneNumberId,
        state,
        idempotencyKey: `whatsapp:${externalId}`,
        fetchImpl,
      });

      outcomes.push({
        externalMessageId: externalId,
        status: 'replied',
        conversationId: reply.conversationId,
        providerMessageId: sent.providerMessageId,
      });
    } catch (error) {
      outcomes.push({ externalMessageId: externalId, status: 'failed', reason: reasonFor(error) });
    }
  }

  return outcomes;
}
