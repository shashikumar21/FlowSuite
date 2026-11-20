// Official Meta WhatsApp Cloud API webhook. Signature is verified over the
// exact raw body before parsing; unknown phone-number IDs never reach a tenant.

import { createAiProvider, type AiProviderEnv } from '../_shared/ai/provider.ts';
import { createAiStore, createServiceClient } from '../_shared/ai/store.ts';
import { processWhatsAppInbound } from '../_shared/ai/whatsapp_inbound.ts';
import {
  extractWhatsAppPhoneNumbers,
  parseWhatsAppWebhook,
  verifyWebhookRequest,
  verifyWebhookSignature,
} from '../_shared/ai/whatsapp.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') ?? '';
const SECRET_REF_RE = /^[A-Z][A-Z0-9_]{2,199}$/;

function providerEnv(): AiProviderEnv {
  return {
    AI_PROVIDER: Deno.env.get('AI_PROVIDER') ?? undefined,
    OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY') ?? undefined,
    OPENAI_MODEL: Deno.env.get('OPENAI_MODEL') ?? undefined,
    OPENAI_BASE_URL: Deno.env.get('OPENAI_BASE_URL') ?? undefined,
    AI_TIMEOUT_MS: Deno.env.get('AI_TIMEOUT_MS') ?? undefined,
    AI_MAX_RETRIES: Deno.env.get('AI_MAX_RETRIES') ?? undefined,
  };
}

function resolveAccessToken(_tenantId: string, secretRef: string | null): string {
  const name = secretRef && SECRET_REF_RE.test(secretRef) && !secretRef.startsWith('VITE_')
    ? secretRef
    : 'WHATSAPP_ACCESS_TOKEN';
  return Deno.env.get(name) ?? '';
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    if (!VERIFY_TOKEN) {
      console.error('whatsapp-webhook: WHATSAPP_VERIFY_TOKEN is not configured');
      return errorResponse(503, 'service_unavailable');
    }
    const challenge = verifyWebhookRequest({
      mode: url.searchParams.get('hub.mode'),
      token: url.searchParams.get('hub.verify_token'),
      challenge: url.searchParams.get('hub.challenge'),
    }, VERIFY_TOKEN);
    if (!challenge) return errorResponse(403, 'verification_failed');
    return new Response(challenge.slice(0, 500), {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed');
  if (!VERIFY_TOKEN || !APP_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('whatsapp-webhook: server configuration is incomplete');
    return errorResponse(503, 'service_unavailable');
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256');
  if (!await verifyWebhookSignature(APP_SECRET, rawBody, signature)) {
    return errorResponse(401, 'invalid_signature');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return errorResponse(400, 'invalid_json');
  }

  let provider;
  try {
    provider = createAiProvider(providerEnv());
  } catch {
    console.error('whatsapp-webhook: AI provider is not configured');
    return errorResponse(503, 'service_unavailable');
  }

  try {
    const client = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const store = createAiStore(client);
    const phoneNumbers = extractWhatsAppPhoneNumbers(payload);
    const phoneNumberToTenant: Record<string, string> = {};
    for (const phoneNumberId of phoneNumbers) {
      const tenantId = await store.resolveTenantForPhoneNumber(phoneNumberId);
      if (tenantId) phoneNumberToTenant[phoneNumberId] = tenantId;
    }

    const messages = parseWhatsAppWebhook(payload, phoneNumberToTenant);
    const results = await processWhatsAppInbound({
      messages,
      store,
      provider,
      resolveAccessToken,
    });
    return jsonResponse({ ok: true, results }, 200);
  } catch (error) {
    // Returning 5xx makes Meta retry; the signature and dedupe checks above
    // make those retries safe. Never echo provider or database errors.
    console.error('whatsapp-webhook: processing failed', error);
    return errorResponse(500, 'processing_failed');
  }
});
