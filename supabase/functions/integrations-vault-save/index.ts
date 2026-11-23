// Securely store a provider secret server-side. Plaintext is encrypted in Edge Function
// with CREDENTIALS_ENCRYPTION_KEY and only ciphertext is stored in DB. Never log plaintext.
// LOCAL ONLY until explicit approval.

import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { errorResponse, jsonResponse } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ENC_KEY = Deno.env.get('CREDENTIALS_ENCRYPTION_KEY') ?? '';

const schema = z.object({
  tenant_id: z.string().uuid(),
  provider: z.enum(['openai', 'whatsapp', 'resend', 'exotel', 'netlify', 'vercel', 'other']),
  secret_name: z.string().regex(/^[A-Z][A-Z0-9_]{2,199}$/),
  secret_value: z.string().min(1).max(8000),
});

async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt']);
}

function b64(bytes: Uint8Array): string {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function encrypt(plaintext: string, secret: string): Promise<{ ciphertext: string; iv: string }> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return { ciphertext: b64(new Uint8Array(enc)), iv: b64(iv) };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed');
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) return errorResponse(503, 'service_unavailable');
  if (!ENC_KEY) return errorResponse(503, 'service_unavailable', 'Secure vault is not configured on the server (CREDENTIALS_ENCRYPTION_KEY missing).');

  const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return errorResponse(401, 'unauthorized');

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return errorResponse(401, 'unauthorized');

  let raw: unknown;
  try { raw = await req.json(); } catch { return errorResponse(400, 'invalid_json'); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return errorResponse(400, 'invalid_request', 'Invalid request');

  const { tenant_id, provider, secret_name, secret_value } = parsed.data;
  if (secret_name.startsWith('VITE_')) return errorResponse(400, 'invalid_request', 'Client-exposed secret names are not allowed');

  const { data: membership, error: memErr } = await supabase
    .from('business_members').select('role')
    .eq('tenant_id', tenant_id).eq('user_id', userData.user.id).eq('status', 'active').maybeSingle();
  if (memErr) return errorResponse(500, 'membership_check_failed');
  if (!membership) return errorResponse(403, 'forbidden');
  if (!['owner', 'admin', 'manager'].includes(String(membership.role))) return errorResponse(403, 'forbidden');

  const { ciphertext, iv } = await encrypt(secret_value, ENC_KEY);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.from('integration_secrets').upsert({
    tenant_id, provider, secret_name, ciphertext, iv, status: 'connected', last_error: null,
    created_by: userData.user.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id,provider,secret_name' }).select('id,provider,secret_name,status,updated_at').single();

  if (error) {
    console.error('integrations-vault-save failed', error.message);
    return errorResponse(500, 'save_failed', 'Could not save secret securely');
  }

  return jsonResponse({ ok: true, secret: data });
});