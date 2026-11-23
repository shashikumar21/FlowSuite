// Google Calendar OAuth start. Authenticated; returns Google consent URL.
// Uses the Supabase single-use state table from migration 0042.
// Deployed with verify_jwt=true. Server-side secrets only.

import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { errorResponse, handleCors, jsonResponse } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI') ?? '';

const payloadSchema = z.object({ tenant_id: z.string().uuid() });
const stateRowSchema = z.array(z.object({
  state_token: z.string().min(32),
  expires_at: z.string(),
}));

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed');
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return errorResponse(503, 'service_unavailable', 'Supabase server configuration is missing');
  if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
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

  const { data: stateData, error: stateError } = await supabase.rpc('oauth_state_create', {
    p_tenant: tenantId,
    p_provider: 'google_calendar',
    p_redirect_path: '/app/booking/calendar',
  });
  if (stateError) {
    console.error('calendar-oauth-start state create failed', stateError);
    return errorResponse(500, 'state_create_failed');
  }
  const parsedState = stateRowSchema.safeParse(stateData);
  const state = parsedState.success ? parsedState.data[0]?.state_token : null;
  if (!state) return errorResponse(500, 'state_create_failed');

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
