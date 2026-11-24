// Google Calendar OAuth callback. Browser redirect target; consumes the
// Supabase single-use state row from migration 0042. Tokens stay server-side.
// Deployed with verify_jwt=false: Google redirects carry no Authorization header.

import { z } from 'zod';
import { createServiceClient } from '../_shared/ai/store.ts';
import { errorResponse } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI') ?? '';
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://flow-suite-two.vercel.app').replace(/\/$/, '');

const stateRowSchema = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  redirect_path: z.string().refine((value) => value.startsWith('/') && !value.startsWith('//')),
});
const consumeResultSchema = z.boolean();

function redirect(path: string, params: Record<string, string>): Response {
  const u = new URL(path, APP_URL);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}

Deno.serve(async (req: Request): Promise<Response> => {
  let redirectPath = '/app/booking/calendar';

  if (req.method !== 'GET') return errorResponse(405, 'method_not_allowed');
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    return redirect(redirectPath, { calendar_error: 'not_configured' });
  }

  const url = new URL(req.url);
  const err = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (err) return redirect(redirectPath, { calendar_error: err.slice(0, 50) });
  if (!code || !state) return redirect(redirectPath, { calendar_error: 'missing_params' });

  const admin = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: rawStateRow, error: stateLookupError } = await admin
    .from('oauth_connection_states')
    .select('tenant_id, user_id, redirect_path')
    .eq('provider', 'google_calendar')
    .eq('state_token', state)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (stateLookupError || !rawStateRow) return redirect(redirectPath, { calendar_error: 'invalid_state' });

  const stateRow = stateRowSchema.safeParse(rawStateRow);
  if (!stateRow.success) return redirect(redirectPath, { calendar_error: 'invalid_state' });
  redirectPath = stateRow.data.redirect_path;

  const { data: consumedRaw, error: consumeError } = await admin.rpc('oauth_state_consume', {
    p_tenant: stateRow.data.tenant_id,
    p_state_token: state,
    p_provider: 'google_calendar',
    p_user_id: stateRow.data.user_id,
  });
  const consumed = consumeResultSchema.safeParse(consumedRaw);
  if (consumeError || !consumed.success || consumed.data !== true) {
    return redirect(redirectPath, { calendar_error: 'invalid_state' });
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI, grant_type: 'authorization_code',
      }),
    });
    const tokenJson = await tokenRes.json().catch(() => ({})) as Record<string, unknown>;
    if (!tokenRes.ok) {
      console.error('calendar-oauth-callback token exchange failed', tokenJson);
      return redirect(redirectPath, { calendar_error: 'token_exchange_failed' });
    }

    const accessToken = typeof tokenJson.access_token === 'string' ? tokenJson.access_token : '';
    const refreshToken = typeof tokenJson.refresh_token === 'string' ? tokenJson.refresh_token : null;
    const expiresIn = typeof tokenJson.expires_in === 'number' ? tokenJson.expires_in : 3600;
    const scope = typeof tokenJson.scope === 'string' ? tokenJson.scope : null;
    if (!accessToken) return redirect(redirectPath, { calendar_error: 'missing_access_token' });

    let googleEmail: string | null = null;
    try {
      const ui = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
      const uj = await ui.json().catch(() => ({})) as Record<string, unknown>;
      if (ui.ok && typeof uj.email === 'string') googleEmail = uj.email;
    } catch { /* non-fatal */ }

    const { data: existing } = await admin.from('calendar_connections')
      .select('refresh_token').eq('tenant_id', stateRow.data.tenant_id).eq('provider', 'google').maybeSingle();

    const row = {
      tenant_id: stateRow.data.tenant_id,
      provider: 'google',
      google_email: googleEmail,
      calendar_id: 'primary',
      access_token: accessToken,
      refresh_token: refreshToken ?? (existing?.refresh_token as string | null) ?? null,
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      scope,
      status: 'connected',
      sync_enabled: false,
      last_error: null,
      connected_by: stateRow.data.user_id,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await admin.from('calendar_connections').upsert(row, { onConflict: 'tenant_id,provider' });
    if (upsertError) {
      console.error('calendar-oauth-callback upsert failed', upsertError);
      return redirect(redirectPath, { calendar_error: 'save_failed' });
    }

    return redirect(redirectPath, { calendar_connected: 'google' });
  } catch (e) {
    console.error('calendar-oauth-callback failed', e);
    return redirect(redirectPath, { calendar_error: 'callback_failed' });
  }
});
