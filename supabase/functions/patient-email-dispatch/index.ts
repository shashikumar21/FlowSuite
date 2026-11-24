// patient-email-dispatch — sends due patient emails from public.patient_email_outbox.
//
// Called every few minutes by pg_cron (see docs/PATIENT_EMAILS.md) with the
// shared secret in `x-flowsuite-secret`. Deploy with --no-verify-jwt because
// the scheduler sends no user JWT; the shared secret is the authentication.
//
// Fails closed: with no secret configured it returns 503, and while no real
// email provider is configured it claims nothing, so no row is ever marked
// sent by the console adapter.

import { createClient } from '@supabase/supabase-js';
import { createEmailProvider } from '../_shared/email.ts';
import { constantTimeEqual, errorResponse, jsonResponse } from '../_shared/http.ts';
import { dispatchPatientEmails, type PatientEmailStore } from '../_shared/patient_email.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('PATIENT_EMAIL_CRON_SECRET') ?? '';
const APP_ORIGIN = Deno.env.get('APP_PUBLIC_URL') ?? '';

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed');
  if (!CRON_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('patient-email-dispatch: PATIENT_EMAIL_CRON_SECRET or Supabase env missing');
    return errorResponse(503, 'not_configured');
  }
  if (!constantTimeEqual(req.headers.get('x-flowsuite-secret') ?? '', CRON_SECRET)) {
    return errorResponse(401, 'unauthorized');
  }

  let origin: string;
  try {
    const url = new URL(APP_ORIGIN);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('insecure');
    origin = url.origin;
  } catch {
    console.error('patient-email-dispatch: APP_PUBLIC_URL must be an https origin');
    return errorResponse(503, 'app_url_not_configured');
  }

  let provider;
  try {
    provider = createEmailProvider({
      EMAIL_PROVIDER: Deno.env.get('EMAIL_PROVIDER'),
      EMAIL_PROVIDER_API_KEY: Deno.env.get('EMAIL_PROVIDER_API_KEY'),
      EMAIL_FROM_ADDRESS: Deno.env.get('EMAIL_FROM_ADDRESS'),
    });
  } catch (error) {
    console.error('patient-email-dispatch: provider configuration error', error);
    return errorResponse(503, 'email_not_configured');
  }
  if (provider.name === 'console') {
    // Leave rows pending so they go out once a real provider is configured.
    return jsonResponse({ ok: false, reason: 'email_not_configured', claimed: 0 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const store: PatientEmailStore = {
    async claimDue(limit) {
      const { data, error } = await admin.rpc('patient_email_claim_due', { p_limit: limit });
      if (error) throw new Error(`claim failed: ${error.message}`);
      return data;
    },
    async markResult({ id, ok, provider: name, providerMessageId, error: detail }) {
      const { error } = await admin.rpc('patient_email_mark_result', {
        p_id: id,
        p_ok: ok,
        p_provider: name,
        p_provider_message_id: providerMessageId ?? null,
        p_error: detail ?? null,
      });
      if (error) console.error('patient-email-dispatch: mark_result failed', { id, error: error.message });
    },
  };

  try {
    const summary = await dispatchPatientEmails({ store, provider, appOrigin: origin, limit: 25 });
    return jsonResponse({ ok: true, ...summary });
  } catch (error) {
    console.error('patient-email-dispatch: run failed', error);
    return errorResponse(500, 'dispatch_failed');
  }
});
