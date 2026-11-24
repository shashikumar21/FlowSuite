import { z } from 'zod'
import { requireSupabase } from '@/integrations/supabase/client'

/**
 * Patient documents are sensitive health data. The browser never receives a
 * service-role key and never uses public Storage URLs. The trusted
 * `patient-documents` Edge Function rechecks tenant membership and role, then
 * returns short-lived signed URLs. All responses are validated here.
 */

export const PATIENT_DOCUMENT_BUCKET = 'patient-documents'
const FUNCTION_NAME = 'patient-documents'

const ALLOWED_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

const idsSchema = z.object({
  tenantId: z.string().uuid(),
  contactId: z.string().uuid(),
})

const httpUrlSchema = z.string().refine((value) => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}, 'Invalid signed URL')

export const patientDocumentResponseSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  created_at: z.string().nullish(),
  content_type: z.string().nullish(),
  size: z.number().nullish(),
  original_name: z.string().nullish(),
  signed_url: httpUrlSchema,
})
export const patientDocumentsResponseSchema = z.array(patientDocumentResponseSchema)
export const patientDocumentSignedUploadSchema = z.object({
  path: z.string().min(1),
  token: z.string().min(1),
})
export const patientDocumentDeleteResultSchema = z.object({ ok: z.boolean() })

export type PatientDocument = {
  name: string
  path: string
  createdAt: string | null
  contentType: string | null
  size: number | null
  originalName: string | null
  signedUrl: string
}

export function allowedPatientDocumentMimeTypes(): string[] {
  return Array.from(new Set(Object.values(ALLOWED_TYPES)))
}

export function extensionForMimeType(mimeType: string): string | null {
  const normalized = mimeType.trim().toLowerCase()
  const match = Object.entries(ALLOWED_TYPES).find(([, mime]) => mime === normalized)
  return match?.[0] ?? null
}

export function sanitizeDocumentLabel(name: string): string {
  const cleaned = name
    .replace(/[^\w.\- ]/g, '')
    .replace(/\.{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return cleaned || 'patient-document'
}

export function buildPatientDocumentPath(
  tenantId: string,
  contactId: string,
  extension: string,
  label: string = 'patient-document',
  id: string = crypto.randomUUID(),
): string {
  const ids = idsSchema.parse({ tenantId, contactId })
  const ext = extension.toLowerCase()
  if (!ALLOWED_TYPES[ext]) throw new Error('Unsupported patient document type')
  return `${ids.tenantId}/${ids.contactId}/${id}-${sanitizeDocumentLabel(label)}.${ext}`
}

/** Signed URLs do not persist custom metadata, so the label lives in the key. */
export function displayNameFromPatientDocumentPath(path: string): string {
  const filename = path.split('/').pop() ?? 'patient-document'
  const withoutExtension = filename.replace(/\.[^.]+$/, '')
  const label = withoutExtension.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    '',
  )
  return label || withoutExtension
}

export function validatePatientDocumentPath(
  tenantId: string,
  contactId: string,
  path: string,
): string {
  const ids = idsSchema.parse({ tenantId, contactId })
  const prefix = `${ids.tenantId}/${ids.contactId}/`
  if (!path.startsWith(prefix) || path.length <= prefix.length || path.includes('..')) {
    throw new Error('Invalid patient document path')
  }
  return path
}

async function invoke<T>(body: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  const { data, error } = await requireSupabase().functions.invoke(FUNCTION_NAME, { body })
  if (error) throw error
  return schema.parse(data)
}

export async function fetchPatientDocuments(
  tenantId: string,
  contactId: string,
): Promise<PatientDocument[]> {
  const ids = idsSchema.parse({ tenantId, contactId })
  const documents = await invoke(
    { action: 'sign_downloads', tenant_id: ids.tenantId, contact_id: ids.contactId },
    patientDocumentsResponseSchema,
  )
  return documents.map((document) => ({
    name: document.name,
    path: document.path,
    createdAt: document.created_at ?? null,
    contentType: document.content_type ?? null,
    size: document.size ?? null,
    originalName: document.original_name ?? displayNameFromPatientDocumentPath(document.path),
    signedUrl: document.signed_url,
  }))
}

export async function uploadPatientDocument(
  tenantId: string,
  contactId: string,
  blob: Blob,
  label: string,
  source: 'camera' | 'upload',
  providedExtension?: string,
): Promise<string> {
  const ids = idsSchema.parse({ tenantId, contactId })
  const extension = (providedExtension ?? extensionForMimeType(blob.type))?.toLowerCase()
  if (!extension || !ALLOWED_TYPES[extension]) {
    throw new Error('Use a PDF, JPG, PNG or WebP file')
  }
  if (!blob.size) throw new Error('The file is empty')
  if (blob.size > 10 * 1024 * 1024) throw new Error('Files must be 10 MB or smaller')

  const path = buildPatientDocumentPath(ids.tenantId, ids.contactId, extension, label)
  const signed = await invoke(
    {
      action: 'sign_upload',
      tenant_id: ids.tenantId,
      contact_id: ids.contactId,
      path,
      content_type: ALLOWED_TYPES[extension],
      file_size: blob.size,
      original_name: sanitizeDocumentLabel(label),
      upload_source: source,
    },
    patientDocumentSignedUploadSchema,
  )

  const { error } = await requireSupabase()
    .storage.from(PATIENT_DOCUMENT_BUCKET)
    .uploadToSignedUrl(signed.path, signed.token, blob, {
      contentType: ALLOWED_TYPES[extension],
      upsert: false,
      metadata: {
        original_name: sanitizeDocumentLabel(label),
        upload_source: source,
      },
    })
  if (error) throw error
  return signed.path
}

export async function deletePatientDocument(
  tenantId: string,
  contactId: string,
  path: string,
): Promise<void> {
  const ids = idsSchema.parse({ tenantId, contactId })
  const safePath = validatePatientDocumentPath(ids.tenantId, ids.contactId, path)
  const result = await invoke(
    {
      action: 'delete',
      tenant_id: ids.tenantId,
      contact_id: ids.contactId,
      path: safePath,
    },
    patientDocumentDeleteResultSchema,
  )
  if (!result.ok) throw new Error('Could not delete the patient document')
}
