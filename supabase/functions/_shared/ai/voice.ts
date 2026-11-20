// Inbound voice FOUNDATION only. This module records verified telephony
// webhook events and call sessions. It performs NO speech recognition, NO text
// to speech, NO provider API calls and NO audio playback. Do not describe this
// as working AI voice until real provider and audio tests pass.

import type { AiWebhookEventResult } from '../../../../src/types/database.ts';
import { constantTimeEqual } from '../http.ts';

/** Must match the provider CHECK on public.channel_credentials / ai_call_sessions. */
export const VOICE_PROVIDERS = ['exotel', 'other'] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];

export function isVoiceProvider(value: string): value is VoiceProvider {
  return (VOICE_PROVIDERS as readonly string[]).includes(value);
}

export type VoiceCallStatus = 'ringing' | 'in_progress' | 'completed' | 'failed' | 'no_answer';

export interface VoiceEvent {
  provider: VoiceProvider;
  /** Provider account identifier used only for a server-side tenant lookup. */
  accountId: string | null;
  callId: string;
  from: string | null;
  to: string | null;
  direction: 'inbound' | 'outbound';
  status: VoiceCallStatus;
  raw: Record<string, unknown>;
}

const HEX = /^[0-9a-f]{64}$/;
const BASE64_SHA256 = /^[A-Za-z0-9+/]{43}=?$/;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function hmacSha256(secret: string, rawBody: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
}

function normalizeSignature(value: string): string {
  const trimmed = value.trim();
  return trimmed.toLowerCase().startsWith('sha256=') ? trimmed.slice(7) : trimmed;
}

/**
 * Verifies an HMAC-SHA256 signature over the EXACT raw body before JSON parsing.
 * Accepts hex or base64; the provider's real header name/format must be
 * configured explicitly. No secret means no verification and no processing.
 */
export async function verifyVoiceSignature(input: {
  secret: string;
  rawBody: string;
  signature: string | null;
}): Promise<boolean> {
  if (!input.secret.trim() || !input.signature) return false;
  const provided = normalizeSignature(input.signature);
  if (!HEX.test(provided) && !BASE64_SHA256.test(provided)) return false;
  const bytes = await hmacSha256(input.secret, input.rawBody);
  return constantTimeEqual(provided, toHex(bytes)) || constantTimeEqual(provided, toBase64(bytes));
}

function firstString(source: Record<string, unknown>, keys: readonly string[], max = 200): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed.slice(0, max);
    }
  }
  return null;
}

function normalizeDirection(value: string | null): 'inbound' | 'outbound' {
  const normalized = (value ?? '').toLowerCase();
  if (['inbound', 'incoming', 'in'].includes(normalized)) return 'inbound';
  if (['outbound', 'outgoing', 'out'].includes(normalized)) return 'outbound';
  // Missing/ambiguous direction defaults to inbound, the safest recording path.
  return 'inbound';
}

function normalizeStatus(value: string | null): VoiceCallStatus {
  switch ((value ?? '').toLowerCase().replace(/[_\s]+/g, '-')) {
    case 'ringing':
    case 'queued':
      return 'ringing';
    case 'in-progress':
    case 'in-progress-callback':
    case 'answered':
      return 'in_progress';
    case 'completed':
    case 'success':
      return 'completed';
    case 'no-answer':
    case 'missed':
    case 'busy':
      return 'no_answer';
    default:
      // Unknown terminal states are recorded as failed with the raw value
      // preserved in metadata; never invent a successful outcome.
      return 'failed';
  }
}

/** Normalises common telephony field names. Extend per provider before deployment. */
export function parseVoiceWebhook(payload: unknown, provider: VoiceProvider): VoiceEvent | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const raw = payload as Record<string, unknown>;

  const callId = firstString(raw, [
    'CallSid', 'call_sid', 'CallUUID', 'call_uuid', 'callId', 'call_id', 'id',
  ], 200);
  if (!callId) return null;

  return {
    provider,
    accountId: firstString(raw, ['AccountSid', 'account_sid', 'accountId', 'account_id'], 120),
    callId,
    from: firstString(raw, ['From', 'from', 'from_number', 'caller'], 60),
    to: firstString(raw, ['To', 'to', 'to_number', 'called'], 60),
    direction: normalizeDirection(firstString(raw, ['Direction', 'direction', 'call_direction'], 30)),
    status: normalizeStatus(firstString(raw, ['CallStatus', 'call_status', 'status', 'Status'], 60)),
    raw,
  };
}

export interface VoiceStore {
  resolveTenantForAccount(provider: VoiceProvider, accountId: string): Promise<string | null>;
  recordWebhookEvent(input: {
    tenantId: string;
    provider: VoiceProvider;
    externalId: string;
    payload: Record<string, unknown>;
  }): Promise<AiWebhookEventResult>;
  upsertCallSession(input: {
    tenantId: string;
    provider: VoiceProvider;
    callId: string;
    from: string | null;
    to: string | null;
    direction: 'inbound' | 'outbound';
    status: VoiceCallStatus;
    metadata: Record<string, unknown>;
  }): Promise<string>;
  recordCallLog(input: {
    tenantId: string;
    sessionId: string;
    outcome: string;
  }): Promise<void>;
}

export type VoiceProcessingStatus = 'recorded' | 'skipped' | 'failed';

export interface VoiceOutcome {
  callId: string;
  status: VoiceProcessingStatus;
  reason?: string;
  sessionId?: string;
}

function reasonFor(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 200);
  return 'unknown_error';
}

/**
 * Records a verified, deduplicated call event into the tenant's CRM. There is
 * deliberately no AI decision, audio response or outbound dialling here.
 */
export async function processVoiceWebhook(input: {
  event: VoiceEvent | null;
  store: VoiceStore;
}): Promise<VoiceOutcome> {
  const { event, store } = input;
  if (!event) return { callId: '', status: 'skipped', reason: 'invalid_payload' };
  if (!event.accountId) return { callId: event.callId, status: 'skipped', reason: 'account_not_mapped' };

  try {
    const tenantId = await store.resolveTenantForAccount(event.provider, event.accountId);
    if (!tenantId) return { callId: event.callId, status: 'skipped', reason: 'tenant_not_mapped' };

    const dedupe = await store.recordWebhookEvent({
      tenantId,
      provider: event.provider,
      externalId: `call:${event.callId}`,
      payload: event.raw,
    });
    if (dedupe.is_duplicate) {
      return { callId: event.callId, status: 'skipped', reason: 'duplicate_event' };
    }

    const sessionId = await store.upsertCallSession({
      tenantId,
      provider: event.provider,
      callId: event.callId,
      from: event.from,
      to: event.to,
      direction: event.direction,
      status: event.status,
      metadata: {
        source: 'voice_webhook',
        providerStatus: event.raw.CallStatus ?? event.raw.call_status ?? null,
      },
    });
    await store.recordCallLog({ tenantId, sessionId, outcome: event.status });

    return { callId: event.callId, status: 'recorded', sessionId };
  } catch (error) {
    return { callId: event.callId, status: 'failed', reason: reasonFor(error) };
  }
}
