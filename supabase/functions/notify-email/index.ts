// notify-email — Milestone 3 communication foundation.
//
// This is an intentionally small, server-only seam. Milestone 3 ships working
// in-app notifications; email delivery is not yet dispatched automatically.
// A later milestone will wire the `notifications` rows with
// delivery_channel='email' / delivery_status='pending' into an outbox that
// invokes this function. Keeping the adapter here means no provider key ever
// reaches a VITE_* variable or the browser bundle.
//
// Auth: internal shared secret in the `x-flowsuite-secret` header. The secret
// and all provider credentials are Supabase secrets, never repository files.

import { createEmailProvider, type EmailMessage } from '../_shared/email.ts';

const INTERNAL_SECRET = Deno.env.get('NOTIFY_EMAIL_SECRET');

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Length-independent comparison so a bad token cannot be guessed byte by byte. */
function secretsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface NotifyEmailPayload extends EmailMessage {}

function parsePayload(value: unknown): NotifyEmailPayload | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const { to, subject, html, text, replyTo, tenantId } = raw;

  if (typeof to !== 'string' || !EMAIL_RE.test(to) || to.length > 320) return null;
  if (typeof subject !== 'string' || subject.trim().length < 1 || subject.length > 200) return null;
  if (typeof html !== 'string' || html.length < 1 || html.length > 100_000) return null;
  if (text !== undefined && (typeof text !== 'string' || text.length > 100_000)) return null;
  if (replyTo !== undefined && (typeof replyTo !== 'string' || !EMAIL_RE.test(replyTo))) return null;
  if (tenantId !== undefined && (typeof tenantId !== 'string' || !UUID_RE.test(tenantId))) return null;

  return {
    to: to.trim(),
    subject: subject.trim(),
    html,
    text: typeof text === 'string' ? text : undefined,
    replyTo: typeof replyTo === 'string' ? replyTo.trim() : undefined,
    tenantId: typeof tenantId === 'string' ? tenantId : undefined,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  // Fail closed while the internal secret is unconfigured.
  if (!INTERNAL_SECRET) {
    console.error('notify-email: NOTIFY_EMAIL_SECRET is not configured');
    return json({ error: 'Service unavailable' }, 503);
  }
  const presented = req.headers.get('x-flowsuite-secret') ?? '';
  if (!secretsEqual(presented, INTERNAL_SECRET)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const message = parsePayload(raw);
  if (!message) {
    return json({ error: 'Invalid message payload' }, 400);
  }

  let provider;
  try {
    provider = createEmailProvider({
      EMAIL_PROVIDER: Deno.env.get('EMAIL_PROVIDER'),
      EMAIL_PROVIDER_API_KEY: Deno.env.get('EMAIL_PROVIDER_API_KEY'),
      EMAIL_FROM_ADDRESS: Deno.env.get('EMAIL_FROM_ADDRESS'),
    });
  } catch (error) {
    // Configuration errors mention variable names only, never values.
    console.error('notify-email: provider configuration error', error);
    return json({ error: 'Email provider is not configured' }, 503);
  }

  try {
    const result = await provider.send(message);
    return json({ ok: true, ...result }, 200);
  } catch (error) {
    // Never echo provider responses: they can contain request metadata.
    console.error('notify-email: delivery failed', {
      provider: provider.name,
      tenantId: message.tenantId ?? null,
      error,
    });
    return json({ ok: false, error: 'Delivery failed' }, 502);
  }
});
