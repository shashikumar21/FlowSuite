// Internal WhatsApp sender for trusted callers (follow-ups and staff tools).
// Requires the shared internal secret and resolves the tenant's own credential
// reference from channel_credentials before touching the Graph API.

import { createAiStore, createServiceClient } from '../_shared/ai/store.ts';
import { sendWhatsAppMessage, WhatsAppSendError } from '../_shared/ai/whatsapp_send.ts';
import { constantTimeEqual, errorResponse, jsonResponse, normalizeIdempotencyKey } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const INTERNAL_SECRET = Deno.env.get('WHATSAPP_SEND_SECRET') ?? '';
const SECRET_REF_RE = /^[A-Z][A-Z0-9_]{2,199}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface SendPayload {
  tenantId: string;
  contactId: string;
  phoneNumberId: string;
  to: string;
  content: string;
  idempotencyKey: string;
  templateName: string | null;
  templateLanguage: string | null;
}

function parsePayload(value: unknown): SendPayload | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const stringField = (key: string, max: number): string | null => {
    const field = raw[key];
    return typeof field === 'string' && field.trim().length > 0 && field.length <= max
      ? field.trim()
      : null;
  };

  const tenantId = stringField('tenantId', 36);
  const contactId = stringField('contactId', 36);
  const phoneNumberId = stringField('phoneNumberId', 120);
  const to = stringField('to', 40);
  const content = stringField('content', 4000);
  const idempotencyKey = normalizeIdempotencyKey(
    typeof raw.idempotencyKey === 'string' ? raw.idempotencyKey : null
  );

  if (!tenantId || !UUID_RE.test(tenantId)) return null;
  if (!contactId || !UUID_RE.test(contactId)) return null;
  if (!phoneNumberId || !to || !content || !idempotencyKey) return null;
  if (raw.templateName != null && (typeof raw.templateName !== 'string' || raw.templateName.length > 120)) return null;
  if (raw.templateLanguage != null && (typeof raw.templateLanguage !== 'string' || raw.templateLanguage.length > 20)) return null;

  return {
    tenantId,
    contactId,
    phoneNumberId,
    to,
    content,
    idempotencyKey,
    templateName: typeof raw.templateName === 'string' ? raw.templateName.trim() : null,
    templateLanguage: typeof raw.templateLanguage === 'string' ? raw.templateLanguage.trim() : null,
  };
}

function statusForSendError(error: WhatsAppSendError): number {
  switch (error.code) {
    case 'not_configured': return 503;
    case 'provider_error': return 502;
    default: return 422;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed');
  if (!INTERNAL_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('whatsapp-send: server configuration is incomplete');
    return errorResponse(503, 'service_unavailable');
  }
  if (!constantTimeEqual(req.headers.get('x-flowsuite-secret') ?? '', INTERNAL_SECRET)) {
    return errorResponse(401, 'unauthorized');
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(400, 'invalid_json');
  }
  const payload = parsePayload(raw);
  if (!payload) return errorResponse(400, 'invalid_request');

  try {
    const client = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: contact, error: contactError } = await client
      .from('contacts')
      .select('id')
      .eq('id', payload.contactId)
      .eq('tenant_id', payload.tenantId)
      .maybeSingle();
    if (contactError) throw contactError;
    if (!contact) return errorResponse(403, 'tenant_mismatch');

    const store = createAiStore(client);
    const secretRef = await store.getCredentialSecretRef(payload.tenantId, payload.phoneNumberId);
    if (!secretRef || !SECRET_REF_RE.test(secretRef) || secretRef.startsWith('VITE_')) {
      return errorResponse(403, 'credential_not_found');
    }
    const accessToken = Deno.env.get(secretRef) ?? '';
    const state = await store.getMessagingState(payload.tenantId, payload.contactId);

    const result = await sendWhatsAppMessage({
      tenantId: payload.tenantId,
      contactId: payload.contactId,
      to: payload.to,
      content: payload.content,
      accessToken,
      phoneNumberId: payload.phoneNumberId,
      state,
      idempotencyKey: payload.idempotencyKey,
      templateName: payload.templateName,
      templateLanguage: payload.templateLanguage,
    });
    return jsonResponse({ ok: true, ...result }, 200);
  } catch (error) {
    if (error instanceof WhatsAppSendError) {
      return errorResponse(statusForSendError(error), error.code);
    }
    console.error('whatsapp-send: delivery failed', {
      tenantId: payload.tenantId,
      contactId: payload.contactId,
    });
    return errorResponse(500, 'processing_failed');
  }
});
