// Website chatbot endpoint. Anonymous by design: the 64-hex public key selects
// an active agent, and all writes use a service-role Supabase client created
// here. No provider key or service-role key is ever returned to the browser.

import { ChatError, runAgentReply } from '../_shared/ai/chat.ts';
import { createAiProvider } from '../_shared/ai/provider.ts';
import { qualifyLead, type Classification } from '../_shared/ai/qualification.ts';
import { createServiceClient, createAiStore, getWebsiteAgent } from '../_shared/ai/store.ts';
import { normalizeIdempotencyKey } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const AI_PROVIDER = Deno.env.get('AI_PROVIDER') ?? undefined;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? undefined;
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') ?? undefined;
const OPENAI_BASE_URL = Deno.env.get('OPENAI_BASE_URL') ?? undefined;
const AI_TIMEOUT_MS = Deno.env.get('AI_TIMEOUT_MS') ?? undefined;
const AI_MAX_RETRIES = Deno.env.get('AI_MAX_RETRIES') ?? undefined;
const ALLOWED_ORIGINS = (Deno.env.get('AI_CHAT_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const PUBLIC_KEY_RE = /^[0-9a-f]{64}$/;

interface ChatPayload {
  publicKey: string;
  message: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  consentToWhatsapp: boolean;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  requestId: string;
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!origin) return {};
  if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin',
    };
  }
  return {};
}

function json(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(req),
    },
  });
}

function isOriginAllowed(req: Request): boolean {
  if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes('*')) return true;
  const origin = req.headers.get('origin');
  return !!origin && ALLOWED_ORIGINS.includes(origin);
}

function parsePayload(value: unknown): ChatPayload | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;

  if (typeof raw.publicKey !== 'string' || !PUBLIC_KEY_RE.test(raw.publicKey)) return null;
  if (typeof raw.message !== 'string' || !raw.message.trim() || raw.message.length > 4000) return null;
  if (raw.name != null && (typeof raw.name !== 'string' || raw.name.length > 200)) return null;
  if (raw.phone != null && (typeof raw.phone !== 'string' || raw.phone.length > 40)) return null;
  if (raw.email != null && (typeof raw.email !== 'string' || raw.email.length > 200)) return null;
  if (raw.consentToWhatsapp != null && typeof raw.consentToWhatsapp !== 'boolean') return null;

  const history: ChatPayload['history'] = [];
  if (raw.history != null) {
    if (!Array.isArray(raw.history) || raw.history.length > 10) return null;
    for (const item of raw.history) {
      if (!item || typeof item !== 'object') return null;
      const entry = item as Record<string, unknown>;
      if (entry.role !== 'user' && entry.role !== 'assistant') return null;
      if (typeof entry.content !== 'string' || entry.content.length > 4000) return null;
      history.push({ role: entry.role, content: entry.content });
    }
  }

  const requestId = normalizeIdempotencyKey(
    typeof raw.idempotencyKey === 'string' ? raw.idempotencyKey : crypto.randomUUID()
  );
  if (!requestId) return null;

  return {
    publicKey: raw.publicKey,
    message: raw.message.trim(),
    name: typeof raw.name === 'string' ? raw.name.trim() : null,
    phone: typeof raw.phone === 'string' ? raw.phone.trim() : null,
    email: typeof raw.email === 'string' ? raw.email.trim() : null,
    consentToWhatsapp: raw.consentToWhatsapp === true,
    history,
    requestId,
  };
}

function statusForError(error: unknown): number {
  if (error instanceof ChatError) return error.status;
  if (error instanceof Error && error.name === 'AiNotConfiguredError') return 503;
  return 500;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') return json({ error: { code: 'method_not_allowed' } }, 405, req);
  if (!isOriginAllowed(req)) return json({ error: { code: 'origin_not_allowed' } }, 403, req);

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('ai-chat: Supabase server configuration is missing');
    return json({ error: { code: 'service_unavailable' } }, 503, req);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: { code: 'invalid_json' } }, 400, req);
  }
  const payload = parsePayload(raw);
  if (!payload) return json({ error: { code: 'invalid_request' } }, 400, req);

  try {
    const client = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const store = createAiStore(client);
    const agent = await getWebsiteAgent(client, payload.publicKey);
    if (!agent) return json({ error: { code: 'agent_not_found' } }, 404, req);

    const provider = createAiProvider({
      AI_PROVIDER,
      OPENAI_API_KEY,
      OPENAI_MODEL,
      OPENAI_BASE_URL,
      AI_TIMEOUT_MS,
      AI_MAX_RETRIES,
    });
    const result = await runAgentReply({
      agent,
      channel: 'website_chat',
      identity: { name: payload.name, phone: payload.phone, email: payload.email },
      message: payload.message,
      history: payload.history,
      provider,
      store,
      requestId: payload.requestId,
      consentToWhatsapp: payload.consentToWhatsapp,
    });

    // Qualification enriches the CRM after the reply is already stored. It is
    // non-fatal: a provider or schema failure must not lose a working chat.
    let classification: Classification | null = null;
    let qualificationError: string | undefined;
    try {
      const qualified = await qualifyLead({
        agent,
        contactId: result.contactId,
        conversationId: result.conversationId,
        customerMessage: payload.message,
        assistantReply: result.reply,
        provider,
        store,
        // A WhatsApp follow-up is only eligible when the visitor opted in.
        followUpChannel: payload.consentToWhatsapp ? 'whatsapp' : null,
        requestId: `qualify:${payload.requestId}`,
      });
      classification = qualified.classification;
    } catch (error) {
      qualificationError = error instanceof Error ? error.message.slice(0, 200) : 'unknown_error';
      console.warn('ai-chat: qualification failed; keeping the delivered reply', {
        requestId: payload.requestId,
        reason: qualificationError,
      });
    }

    return json({
      ok: true,
      reply: result.reply,
      needsHandoff: result.needsHandoff,
      escalatedForSafety: result.escalatedForSafety,
      conversationId: result.conversationId,
      classification,
      ...(qualificationError ? { qualificationError } : {}),
    }, 200, req);
  } catch (error) {
    const code = error instanceof ChatError ? error.code
      : error instanceof Error && error.name === 'AiNotConfiguredError' ? 'not_configured'
      : 'internal_error';
    console.error('ai-chat: request failed', {
      code,
      requestId: payload.requestId,
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return json({ error: { code } }, statusForError(error), req);
  }
});
