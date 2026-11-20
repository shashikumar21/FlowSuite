import { requireSupabase } from '@/integrations/supabase/client'
import type { ContactFilters } from '../api'
import type {
  BatchResult,
  DuplicateMatch,
  DuplicateMode,
  ExportRow,
  ImportJob,
  ImportKind,
  ImportOptions,
  ImportRow,
  ImportSummary,
} from './types'
import type { ContactImportJobRow, Json } from '@/types/database'

function asJson(value: unknown): Json {
  return value as Json
}

/** Starts (or returns the existing) idempotent import job. Server derives tenant. */
export async function startImport(
  tenantId: string,
  input: {
    kind: ImportKind
    fileName: string
    fileSize: number
    fileHash: string
    duplicateMode: DuplicateMode
    totalRows: number
  },
): Promise<string> {
  const { data, error } = await requireSupabase().rpc('crm_start_import', {
    p_tenant: tenantId,
    p_kind: input.kind,
    p_file_name: input.fileName,
    p_file_size: input.fileSize,
    p_file_hash: input.fileHash,
    p_duplicate_mode: input.duplicateMode,
    p_total_rows: input.totalRows,
  })
  if (error) throw error
  return data
}

/** Authoritative duplicate preview, calculated from database rows only. */
export async function checkDuplicates(
  tenantId: string,
  rows: ImportRow[],
): Promise<DuplicateMatch[]> {
  const { data, error } = await requireSupabase().rpc('crm_check_import_duplicates', {
    p_tenant: tenantId,
    p_rows: asJson(rows),
  })
  if (error) throw error
  return (data ?? []) as unknown as DuplicateMatch[]
}

export async function confirmNewDuplicates(jobId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('crm_confirm_import_duplicates', {
    p_job_id: jobId,
  })
  if (error) throw error
}

export async function processBatch(
  jobId: string,
  batchIndex: number,
  rows: ImportRow[],
): Promise<BatchResult> {
  const { data, error } = await requireSupabase().rpc('crm_process_import_batch', {
    p_job_id: jobId,
    p_batch_index: batchIndex,
    p_rows: asJson(rows),
  })
  if (error) throw error
  return data as unknown as BatchResult
}

export async function completeImport(jobId: string, failed = false): Promise<ImportSummary> {
  const { data, error } = await requireSupabase().rpc('crm_complete_import', {
    p_job_id: jobId,
    p_failed: failed,
  })
  if (error) throw error
  return data as unknown as ImportSummary
}

/** Manager-only import audit history, read through RLS. */
export async function fetchImportHistory(tenantId: string): Promise<ImportJob[]> {
  const { data, error } = await requireSupabase()
    .from('contact_import_jobs')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50)
    .returns<ContactImportJobRow[]>()
  if (error) throw error
  return (data ?? []).map((row) => ({
    ...row,
    kind: row.kind as ImportKind,
    duplicate_mode: row.duplicate_mode as DuplicateMode,
    error_report: Array.isArray(row.error_report)
      ? (row.error_report as unknown as ImportJob['error_report'])
      : [],
  }))
}

/** Small option set used by the mapping screen; scoped to the caller's tenant. */
export async function fetchImportOptions(tenantId: string): Promise<ImportOptions> {
  const supabase = requireSupabase()
  const [sources, tags, members, fields] = await Promise.all([
    supabase
      .from('lead_sources')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .order('name')
      .returns<Array<{ id: string; name: string }>>(),
    supabase
      .from('tags')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name')
      .returns<Array<{ id: string; name: string }>>(),
    supabase
      .from('business_members')
      .select('user_id, role, profiles(full_name)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .returns<Array<{ user_id: string; profiles: { full_name: string | null } | null }>>(),
    supabase
      .from('custom_fields')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .in('entity_type', ['contact', 'lead'])
      .order('position')
      .returns<ImportOptions['customFields']>(),
  ])
  const firstError = sources.error ?? tags.error ?? members.error ?? fields.error
  if (firstError) throw firstError
  return {
    sources: sources.data ?? [],
    tags: tags.data ?? [],
    members: (members.data ?? []).map((member) => ({
      user_id: member.user_id,
      full_name: member.profiles?.full_name ?? null,
    })),
    customFields: fields.data ?? [],
  }
}

/**
 * Exports only rows the caller is permitted to see, as decided by the RPC's
 * can_view_contact predicate. No client-supplied tenant id is ever trusted.
 */
export async function exportRows(
  tenantId: string,
  kind: ImportKind,
  filters: ContactFilters,
): Promise<ExportRow[]> {
  const { data, error } = await requireSupabase().rpc('crm_export_rows', {
    p_tenant: tenantId,
    p_kind: kind,
    p_query: filters.query || null,
    p_status: filters.status || null,
    p_lead_status: filters.leadStatus || null,
    p_source_id: filters.sourceId || null,
    p_assigned_to: filters.assignedTo || null,
    p_tag_id: filters.tagId || null,
    p_limit: 5000,
  })
  if (error) throw error
  return (data ?? []) as unknown as ExportRow[]
}
