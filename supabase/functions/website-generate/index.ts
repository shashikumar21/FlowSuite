// Website Builder AI generation - authenticated, server-side only.
// NOT DEPLOYED by default. Deploying/configuring provider requires explicit approval.
// The browser shows a clear error when this function is unavailable.

import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { createAiProvider } from '../_shared/ai/provider.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';

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
  prompt: z.string().trim().min(10).max(4000),
  business_name: z.string().trim().max(120).optional().default(''),
  phone: z.string().trim().max(60).optional().default(''),
  email: z.string().trim().max(120).optional().default(''),
});

const RESPONSE_FORMAT = {
  name: 'website_generate',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['html'],
    properties: {
      html: { type: 'string', minLength: 100, maxLength: 120000 },
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
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return errorResponse(503, 'service_unavailable', 'Supabase server configuration is missing');

  const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return errorResponse(401, 'unauthorized', 'A signed-in session is required');

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return errorResponse(401, 'unauthorized');

  let raw: unknown;
  try { raw = await req.json(); } catch { return errorResponse(400, 'invalid_json'); }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return errorResponse(400, 'invalid_request', 'Invalid website prompt');

  const { tenant_id, prompt, business_name, phone, email } = parsed.data;
  const { data: membership, error: membershipError } = await supabase
    .from('business_members').select('user_id')
    .eq('tenant_id', tenant_id).eq('user_id', userData.user.id).eq('status', 'active').maybeSingle();
  if (membershipError) return errorResponse(500, 'membership_check_failed');
  if (!membership) return errorResponse(403, 'forbidden');

  try {
    const provider = createAiProvider({ AI_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL, AI_TIMEOUT_MS, AI_MAX_RETRIES });
    const system = `You generate a complete, single-file static website as HTML.
Return only JSON with key "html" containing the full <!doctype html> document.
Rules: modern responsive CSS inside <style>, no external scripts, no secrets, no tracking, accessible semantic HTML.
Include mobile-friendly layout, clear CTA, and contact section. Use tel: and mailto: when phone/email provided.
If the user asks for illegal/harmful content, return a simple safe landing page instead.`;
    const user = `Business name: ${business_name || 'Business'}\nPhone: ${phone || 'N/A'}\nEmail: ${email || 'N/A'}\n\nWebsite request:\n${prompt}`;

    const completion = await provider.complete({
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.7,
      maxTokens: 6000,
      responseFormat: RESPONSE_FORMAT,
    });

    let candidate: unknown = completion.parsed;
    if (candidate == null && completion.content.trim()) {
      try { candidate = JSON.parse(completion.content); } catch { /* fall through */ }
    }
    const out = z.object({ html: z.string().min(100) }).safeParse(candidate);
    if (!out.success) return errorResponse(502, 'invalid_ai_response', 'AI returned an invalid website response');
    const html = out.data.html;
    if (!/<!doctype html/i.test(html) && !/<html/i.test(html)) return errorResponse(502, 'invalid_ai_response', 'AI response was not a complete HTML document');
    return jsonResponse({ html });
  } catch (error) {
    const status = statusForError(error);
    const msg = error instanceof Error ? error.message : 'Website generation failed';
    return errorResponse(status, status === 503 ? 'service_unavailable' : 'generation_failed', msg);
  }
});
