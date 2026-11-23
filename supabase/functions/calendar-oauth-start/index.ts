// Google Calendar OAuth start (Phase 1). Authenticated; returns Google consent URL.
// NOT DEPLOYED until explicit approval. Server-side secrets only.

import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { errorResponse, handleCors, jsonResponse } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI') ?? '';
const STATE_SECRET = Deno.env.get('GOOGLE_OAUTH_STATE_SECRET') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const payloadSchema = z.object({ tenant_id: z.string().uuid() });

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signState(payload: Record<string, unknown>): Promise<string> {
  const body = b64url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(STATE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed');
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return errorResponse(503, 'service_unavailable', 'Supabase server configuration is missing');
  if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI || !STATE_SECRET) {
    return errorResponse(503, 'service_unavailable', 'Google Calendar OAuth is not configured on the server.');
  }

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
  if (!parsed.success) return errorResponse(400, 'invalid_request', 'Invalid request');

  const tenantId = parsed.data.tenant_id;
  const { data: membership, error: membershipError } = await supabase
    .from('business_members').select('user_id, role')
    .eq('tenant_id', tenantId).eq('user_id', userData.user.id).eq('status', 'active').maybeSingle();
  if (membershipError) return errorResponse(500, 'membership_check_failed');
  if (!membership) return errorResponse(403, 'forbidden');
  if (!['owner', 'admin', 'manager'].includes(String(membership.role))) return errorResponse(403, 'forbidden');

  const state = await signState({
    tenant_id: tenantId,
    user_id: userData.user.id,
    nonce: crypto.randomUUID(),
    exp: Date.now() + 10 * 60 * 1000,
  });

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email',
    state,
  });

  return jsonResponse({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});
