// Sales Agent Phase 3 — authenticated AI draft generation.
//
// NOT DEPLOYED in this phase. Deploying is a separate, explicitly approved
// action. The browser falls back to an honest "service not available" error.
//
// Server-only: the provider key never leaves this function. The caller's JWT
// is verified and tenant membership is checked with the caller's own client,
// so RLS applies. No service-role key is used and nothing is written here.

import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { createAiProvider } from '../_shared/ai/provider.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import {
  emailDraftInputSchema,
  generatedDraftSchema,
} from '../../../../src/modules/sales-agent/outreach/schemas.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const AI_PROVIDER = Deno.env.get('AI_PROVIDER') ?? undefined;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? undefined;
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') ?? undefined;
const OPENAI_BASE_URL = Deno.env.get('OPENAI_BASE_URL') ?? undefined;
const AI_TIMEOUT_MS = Deno.env.get('AI_TIMEOUT_MS') ?? undefined;
const AI_MAX_RETRIES = Deno.env.get('AI_MAX_RETRIES') ?? undefined;

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  input: emailDraftInputSchema,
});

const RESPONSE_FORMAT = {
  name: 'sales_email_draft',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['subject', 'opening', 'body', 'cta', 'follow_up_subject', 'follow_up_body'],
    properties: {
      subject: { type: 'string', minLength: 1, maxLength: 200 },
      opening: { type: 'string', minLength: 1, maxLength: 1000 },
      body: { type: 'string', minLength: 1, maxLength: 8000 },
      cta: { type: 'string', minLength: 1, maxLength: 500 },
      follow_up_subject: { type: 'string', minLength: 1, maxLength: 200 },
      follow_up_body: { type: 'string', minLength: 1, maxLength: 4000 },
    },
  },
};

function statusForError(error: unknown): number {
  if (error instanceof z.ZodError) return 400;
  if (error instanceof Error) {
    if (error.name === 'AiNotConfiguredError') return 503;
    if (error.name === 'AiRateLimitError') return 429;
    if (error.name === 'AiTimeoutError') return 504;
  }
  return 502;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return errorResponse(503, 'service_unavailable', 'Supabase server configuration is missing');
  }

  const authorization = req.headers.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return errorResponse(401, 'unauthorized', 'A signed-in session is required');

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return errorResponse(401, 'unauthorized');

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(400, 'invalid_json');
  }

  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return errorResponse(400, 'invalid_request', 'Invalid draft input');

  const { tenant_id, input } = parsed.data;

  // RLS applies to this client; a user who is not an active member sees no row.
  const { data: membership, error: membershipError } = await supabase
    .from('business_members')
    .select('user_id')
    .eq('tenant_id', tenant_id)
    .eq('user_id', userData.user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (membershipError) return errorResponse(500, 'membership_check_failed');
  if (!membership) return errorResponse(403, 'forbidden');

  try {
    const provider = createAiProvider({
      AI_PROVIDER,
      OPENAI_API_KEY,
      OPENAI_MODEL,
      OPENAI_BASE_URL,
      AI_TIMEOUT_MS,
      AI_MAX_RETRIES,
    });

    const context = [
      `Prospect business website: ${input.business_website || 'not supplied'}`,
      `Industry: ${input.industry || 'not supplied'}`,
      `Product or service offered: ${input.product_offered}`,
      `Problem addressed: ${input.problem_addressed}`,
      `Campaign objective: ${input.campaign_objective}`,
      `Tone: ${input.tone}`,
    ].join('\n');

    const completion = await provider.complete({
      messages: [
        {
          role: 'system',
          content:
            'You write short, honest B2B outreach email drafts. Use only facts present in the supplied context. ' +
            'Never invent customer names, results, statistics, integrations or certifications about the recipient. ' +
            'If a detail is missing, write a neutral sentence instead of guessing. ' +
            'This is an UNSENT DRAFT: never claim an email was sent, scheduled or delivered. ' +
            'Respond with JSON matching the requested schema and no other text.',
        },
        {
          role: 'user',
          content:
            `Write an initial outreach email and one separate follow-up draft for this prospect.\n${context}\n` +
            'Personalise the opening without pretending to know unsupplied facts. Explain the problem and offer plainly. ' +
            'The cta is a single low-pressure call to action. The follow-up is a brief reminder, not a send notification.',
        },
      ],
      responseFormat: RESPONSE_FORMAT,
      temperature: 0.4,
      maxTokens: 1200,
      requestId: crypto.randomUUID(),
    });

    let candidate: unknown = completion.parsed;
    if (candidate == null && completion.content.trim()) {
      try {
        candidate = JSON.parse(completion.content);
      } catch {
        return errorResponse(502, 'invalid_response', 'The provider returned invalid JSON');
      }
    }
    const draft = generatedDraftSchema.safeParse(candidate);
    if (!draft.success) {
      return errorResponse(502, 'schema_mismatch', 'The provider returned an unexpected shape');
    }

    // Explicitly not saved: the browser must call sales_save_email_draft.
    return jsonResponse({ draft: draft.data, saved: false, sent: false });
  } catch (error) {
    const status = statusForError(error);
    const message = error instanceof Error ? error.message : 'Draft generation failed';
    console.error('sales-email-draft:', message);
    return jsonResponse({ error: { code: status === 503 ? 'not_configured' : 'provider_error', message } }, status);
  }
});
