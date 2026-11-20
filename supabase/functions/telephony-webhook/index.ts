// Inbound voice FOUNDATION. Verifies a telephony webhook and records the call
// in the tenant's CRM. There is NO STT, TTS, audio playback, AI decision or
// outbound dialling here. Do not call this "working AI voice" until real
// provider and audio tests pass.

import { createVoiceStore, createServiceClient } from '../_shared/ai/store.ts';
import {
  isVoiceProvider,
  parseVoiceWebhook,
  processVoiceWebhook,
  verifyVoiceSignature,
} from '../_shared/ai/voice.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VOICE_PROVIDER = Deno.env.get('VOICE_PROVIDER') ?? '';
const WEBHOOK_SECRET = Deno.env.get('VOICE_WEBHOOK_SECRET') ?? '';
const SIGNATURE_HEADER = (Deno.env.get('VOICE_SIGNATURE_HEADER') ?? 'x-flowsuite-signature')
  .trim()
  .toLowerCase();

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed');

  if (!isVoiceProvider(VOICE_PROVIDER) || !WEBHOOK_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('telephony-webhook: server configuration is incomplete');
    return errorResponse(503, 'service_unavailable');
  }

  const rawBody = await req.text();
  const verified = await verifyVoiceSignature({
    secret: WEBHOOK_SECRET,
    rawBody,
    signature: req.headers.get(SIGNATURE_HEADER),
  });
  if (!verified) return errorResponse(401, 'invalid_signature');

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return errorResponse(400, 'invalid_json');
  }

  const event = parseVoiceWebhook(payload, VOICE_PROVIDER);
  if (!event) return jsonResponse({ ok: true, result: { status: 'skipped', reason: 'invalid_payload' } });

  try {
    const client = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const store = createVoiceStore(client);
    const result = await processVoiceWebhook({ event, store });
    return jsonResponse({ ok: true, result }, 200);
  } catch (error) {
    // Meta/telephony providers retry on 5xx. Signature verification and DB
    // dedupe make retries safe; never echo provider or database errors.
    console.error('telephony-webhook: processing failed', error);
    return errorResponse(500, 'processing_failed');
  }
});
