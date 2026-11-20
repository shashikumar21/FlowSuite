// Small follow-up worker: claims due jobs from the DB, re-checks consent and
// sends one approved WhatsApp template per job. Requires the internal secret.

import { processFollowUpJobs } from '../_shared/ai/follow_up.ts';
import { createAiStore, createServiceClient } from '../_shared/ai/store.ts';
import { constantTimeEqual, errorResponse, jsonResponse } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const INTERNAL_SECRET = Deno.env.get('AI_FOLLOW_UP_WORKER_SECRET') ?? '';
const SECRET_REF_RE = /^[A-Z][A-Z0-9_]{2,199}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveAccessToken(_tenantId: string, secretRef: string): string {
  if (!SECRET_REF_RE.test(secretRef) || secretRef.startsWith('VITE_')) return '';
  return Deno.env.get(secretRef) ?? '';
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed');
  if (!INTERNAL_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('ai-follow-up-worker: server configuration is incomplete');
    return errorResponse(503, 'service_unavailable');
  }
  if (!constantTimeEqual(req.headers.get('x-flowsuite-secret') ?? '', INTERNAL_SECRET)) {
    return errorResponse(401, 'unauthorized');
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(400, 'invalid_json');
  }
  const jobIds = (raw as { jobIds?: unknown })?.jobIds;
  if (!Array.isArray(jobIds) || jobIds.length === 0 || jobIds.length > 50) {
    return errorResponse(400, 'invalid_request');
  }
  if (jobIds.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
    return errorResponse(400, 'invalid_job_id');
  }

  try {
    const client = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const store = createAiStore(client);
    const results = await processFollowUpJobs({
      jobIds: jobIds as string[],
      store,
      resolveAccessToken,
    });
    return jsonResponse({ ok: true, results }, 200);
  } catch (error) {
    console.error('ai-follow-up-worker: processing failed', error);
    return errorResponse(500, 'processing_failed');
  }
});
