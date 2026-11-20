// Server-only WhatsApp Cloud API helpers. Official Meta API only; no
// unofficial libraries. Never import from src/**.

import { constantTimeEqual } from '../http.ts';

export interface WhatsAppVerifyParams {
  mode: string | null;
  token: string | null;
  challenge: string | null;
}

/** GET verification handshake. Returns the challenge only on an exact match. */
export function verifyWebhookRequest(params: WhatsAppVerifyParams, verifyToken: string): string | null {
  if (params.mode !== 'subscribe') return null;
  if (!params.token || !constantTimeEqual(params.token, verifyToken)) return null;
  return params.challenge ?? null;
}

/** HMAC-SHA256 over the exact raw request body, as required by Meta. */
export async function computeWhatsAppSignature(
  appSecret: string,
  rawBody: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  return `sha256=${Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function verifyWebhookSignature(
  appSecret: string,
  rawBody: string,
  signatureHeader: string | null
): Promise<boolean> {
  if (!signatureHeader) return false;
  const expected = await computeWhatsAppSignature(appSecret, rawBody);
  return constantTimeEqual(signatureHeader, expected);
}

export interface WhatsAppInboundMessage {
  tenantId: string | null;
  phoneNumberId: string;
  externalMessageId: string;
  from: string;
  timestamp: string;
  type: string;
  text: string | null;
  contactName: string | null;
}

interface MetaMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
}

interface MetaChangeValue {
  metadata?: { phone_number_id?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: MetaMessage[];
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{ field?: string; value?: MetaChangeValue }>;
  }>;
}

/**
 * Parses an official Meta messages webhook into safe, bounded records.
 * phoneNumberId is resolved to a tenant through an explicit server-side map;
 * an unmapped number yields tenantId = null and must be rejected by the caller.
 */
export function parseWhatsAppWebhook(
  payload: unknown,
  phoneNumberToTenant: Readonly<Record<string, string>>
): WhatsAppInboundMessage[] {
  if (!payload || typeof payload !== 'object') return [];
  const body = payload as MetaWebhookPayload;
  if (body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return [];

  const messages: WhatsAppInboundMessage[] = [];
  for (const entry of body.entry) {
    for (const change of entry?.changes ?? []) {
      if (change.field !== 'messages') continue;
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id?.trim();
      if (!phoneNumberId) continue;
      const tenantId = phoneNumberToTenant[phoneNumberId] ?? null;
      const names = new Map(
        (value?.contacts ?? []).map((contact) => [contact.wa_id ?? '', contact.profile?.name ?? null])
      );

      for (const message of value?.messages ?? []) {
        const externalId = message.id?.trim();
        const from = message.from?.trim();
        if (!externalId || !from) continue;
        const text = message.type === 'text' ? message.text?.body?.trim() : null;
        messages.push({
          tenantId,
          phoneNumberId,
          externalMessageId: externalId.slice(0, 200),
          from: from.slice(0, 60),
          timestamp: message.timestamp?.trim() ?? '',
          type: message.type ?? 'unknown',
          text: text ? text.slice(0, 4000) : null,
          contactName: names.get(from)?.slice(0, 120) ?? null,
        });
      }
    }
  }
  return messages;
}

/** Collects WABA phone-number IDs from a raw Meta payload for tenant mapping. */
export function extractWhatsAppPhoneNumbers(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const body = payload as MetaWebhookPayload;
  const ids = new Set<string>();
  for (const entry of body.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change.field !== 'messages') continue;
      const id = change.value?.metadata?.phone_number_id?.trim();
      if (id) ids.add(id.slice(0, 120));
    }
  }
  return [...ids];
}

/** Normalises Indian phone numbers to E.164 with an India default. */
export function normalizeWhatsAppSender(value: string): string | null {
  const digits = value.replace(/[^\d]/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15 && value.trim().startsWith('+')) return `+${digits}`;
  return null;
}
