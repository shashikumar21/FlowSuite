// Google Calendar OAuth callback (Phase 1). Browser redirect target; verifies signed state.
// NOT DEPLOYED until explicit approval. Server-side secrets only.

import { createServiceClient } from '../_shared/ai/store.ts';
import { errorResponse } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI') ?? '';
const STATE_SECRET = Deno.env.get('GOOGLE_OAUTH_STATE_SECRET') ?? SERVICE_ROLE_KEY;
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://rococo-florentine-8dbe2c.netlify.app').replace(/\/$/, '');

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function verifyState(state: string): Promise<{ tenant_id: string; user_id: string; exp: number } | null> {
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(STATE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), new TextEncoder().encode(body));
  if (!ok) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as { tenant_id?: string; user_id?: string; exp?: number };
    if (!payload.tenant_id || !payload.user_id || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return { tenant_id: payload.tenant_id, user_id: payload.user_id, exp: payload.exp };
  } catch { return null; }
}

function redirect(path: string, params: Record<string, string>): Response {
  const u = new URL(path, APP_URL);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'GET') return errorResponse(405, 'method_not_allowed');
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI || !STATE_SECRET) {
    return redirect('/app/booking/calendar', { calendar_error: 'not_configured' });
  }

  const url = new URL(req.url);
  const err = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (err) return redirect('/app/booking/calendar', { calendar_error: err.slice(0, 50) });
  if (!code || !state) return redirect('/app/booking/calendar', { calendar_error: 'missing_params' });

  const payload = await verifyState(state);
  if (!payload) return redirect('/app/booking/calendar', { calendar_error: 'invalid_state' });

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
      return redirect('/app/booking/calendar', { calendar_error: 'token_exchange_failed' });
    }

    const accessToken = typeof tokenJson.access_token === 'string' ? tokenJson.access_token : '';
    const refreshToken = typeof tokenJson.refresh_token === 'string' ? tokenJson.refresh_token : null;
    const expiresIn = typeof tokenJson.expires_in === 'number' ? tokenJson.expires_in : 3600;
    const scope = typeof tokenJson.scope === 'string' ? tokenJson.scope : null;
    if (!accessToken) return redirect('/app/booking/calendar', { calendar_error: 'missing_access_token' });

    let googleEmail: string | null = null;
    try {
      const ui = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
      const uj = await ui.json().catch(() => ({})) as Record<string, unknown>;
      if (ui.ok && typeof uj.email === 'string') googleEmail = uj.email;
    } catch { /* non-fatal */ }

    const admin = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: existing } = await admin.from('calendar_connections')
      .select('refresh_token').eq('tenant_id', payload.tenant_id).eq('provider', 'google').maybeSingle();

    const row = {
      tenant_id: payload.tenant_id,
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
      connected_by: payload.user_id,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await admin.from('calendar_connections').upsert(row, { onConflict: 'tenant_id,provider' });
    if (upsertError) {
      console.error('calendar-oauth-callback upsert failed', upsertError);
      return redirect('/app/booking/calendar', { calendar_error: 'save_failed' });
    }

    return redirect('/app/booking/calendar', { calendar_connected: 'google' });
  } catch (e) {
    console.error('calendar-oauth-callback failed', e);
    return redirect('/app/booking/calendar', { calendar_error: 'callback_failed' });
  }
});
