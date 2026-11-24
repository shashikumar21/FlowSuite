// Patient document signer. Authenticated; returns short-lived Storage URLs.
// Deploy with verify_jwt=true. Uses the service role only on the server.
// Requires migration 0045_patient_documents_storage.sql.

import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { errorResponse, handleCors, jsonResponse } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BUCKET = 'patient-documents';
const SIGNED_URL_TTL = 600;

const CONTENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
const EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'] as const;

const commonSchema = z.object({
  tenant_id: z.string().uuid(),
  contact_id: z.string().uuid(),
});

const requestSchema = z.discriminatedUnion('action', [
  commonSchema.extend({
    action: z.literal('sign_upload'),
    path: z.string().min(1).max(300),
    content_type: z.enum(CONTENT_TYPES),
    file_size: z.number().int().positive().max(10 * 1024 * 1024),
  }),
  commonSchema.extend({ action: z.literal('sign_downloads') }),
  commonSchema.extend({
    action: z.literal('delete'),
    path: z.string().min(1).max(300),
  }),
]);

const signedUploadSchema = z.object({
  path: z.string().min(1),
  token: z.string().min(1),
});
const storedObjectSchema = z.object({
  name: z.string().min(1),
  created_at: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
}).passthrough();
const signedUrlSchema = z.object({ signedUrl: z.string().min(1) });

function isSafePath(path: string, tenantId: string, contactId: string): boolean {
  const prefix = `${tenantId}/${contactId}/`;
  if (!path.startsWith(prefix) || path.length <= prefix.length || path.includes('..')) return false;
  const file = path.slice(prefix.length);
  if (file.includes('/')) return false;
  const extension = file.split('.').pop()?.toLowerCase() ?? '';
  return (EXTENSIONS as readonly string[]).includes(extension);
}

function metadataText(metadata: z.infer<typeof storedObjectSchema>['metadata'], key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function metadataSize(metadata: z.infer<typeof storedObjectSchema>['metadata']): number | null {
  const value = metadata?.['size'];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed');
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    return errorResponse(503, 'service_unavailable', 'Supabase server configuration is missing');
  }

  const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return errorResponse(401, 'unauthorized', 'A signed-in session is required');

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) return errorResponse(401, 'unauthorized');

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(400, 'invalid_json');
  }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return errorResponse(400, 'invalid_request', 'Invalid patient document request');
  const body = parsed.data;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: allowed, error: authError } = await admin.rpc('can_manage_patient_document_for_user', {
    p_tenant: body.tenant_id,
    p_contact: body.contact_id,
    p_user: userData.user.id,
  });
  if (authError) {
    console.error('patient-document authorization failed', authError);
    return errorResponse(500, 'authorization_failed');
  }
  if (allowed !== true) return errorResponse(403, 'forbidden');

  async function audit(action: string, objectPath: string, contentType: string | null): Promise<boolean> {
    const { error: auditError } = await admin.rpc('patient_document_audit_record', {
      p_tenant: body.tenant_id,
      p_contact: body.contact_id,
      p_user: userData.user.id,
      p_object_path: objectPath,
      p_action: action,
      p_content_type: contentType,
    });
    if (auditError) {
      console.error('patient-document audit failed', auditError);
      return false;
    }
    return true;
  }

  if (body.action === 'sign_upload') {
    if (!isSafePath(body.path, body.tenant_id, body.contact_id)) {
      return errorResponse(400, 'invalid_path');
    }
    const extension = body.path.split('.').pop()?.toLowerCase();
    const expected = body.content_type === 'application/pdf' ? 'pdf'
      : body.content_type === 'image/jpeg' ? 'jpg'
      : body.content_type === 'image/png' ? 'png' : 'webp';
    if (extension !== expected && !(extension === 'jpeg' && expected === 'jpg')) {
      return errorResponse(400, 'content_type_mismatch');
    }
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(body.path, { upsert: false });
    if (error || !data) {
      console.error('patient-document upload signing failed', error);
      return errorResponse(500, 'sign_upload_failed');
    }
    const signed = signedUploadSchema.safeParse(data);
    if (!signed.success) return errorResponse(500, 'sign_upload_failed');
    if (!await audit('patient_document.upload_signed', signed.data.path, body.content_type)) {
      return errorResponse(500, 'audit_failed');
    }
    return jsonResponse({ path: signed.data.path, token: signed.data.token });
  }

  if (body.action === 'sign_downloads') {
    const folder = `${body.tenant_id}/${body.contact_id}`;
    const { data: objects, error: listError } = await admin.storage.from(BUCKET).list(folder, {
      limit: 100,
      sortBy: { column: 'created_at', order: 'desc' },
    });
    if (listError) {
      console.error('patient-document list failed', listError);
      return errorResponse(500, 'list_failed');
    }
    const parsedObjects = storedObjectSchema.array().safeParse(objects ?? []);
    if (!parsedObjects.success) return errorResponse(500, 'invalid_storage_response');

    const documents = await Promise.all(parsedObjects.data.map(async (item) => {
      const path = `${folder}/${item.name}`;
      const { data: signed, error: signedError } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL);
      if (signedError || !signed) throw signedError ?? new Error('Missing signed URL');
      const parsedSigned = signedUrlSchema.parse(signed);
      return {
        path,
        name: item.name,
        created_at: item.created_at ?? null,
        content_type: metadataText(item.metadata, 'mimetype') ?? metadataText(item.metadata, 'content_type'),
        size: metadataSize(item.metadata),
        original_name: metadataText(item.metadata, 'original_name'),
        signed_url: parsedSigned.signedUrl,
      };
    }));

    if (!await audit('patient_document.viewed', `${folder}/view`, null)) {
      return errorResponse(500, 'audit_failed');
    }
    return jsonResponse(documents);
  }

  if (!isSafePath(body.path, body.tenant_id, body.contact_id)) {
    return errorResponse(400, 'invalid_path');
  }
  const { error: removeError } = await admin.storage.from(BUCKET).remove([body.path]);
  if (removeError) {
    console.error('patient-document delete failed', removeError);
    return errorResponse(500, 'delete_failed');
  }
  if (!await audit('patient_document.deleted', body.path, null)) {
    return errorResponse(500, 'audit_failed');
  }
  return jsonResponse({ ok: true });
});
