import type { ContactSearchRow, CustomFieldRow } from '@/types/database'

export type ImportKind = 'contacts' | 'leads'
export type DuplicateMode = 'skip' | 'update' | 'new'

export type ParsedSheet = {
  name: string
  rows: string[][]
  headerRowIndex: number
}

export type ParsedWorkbook = {
  fileName: string
  fileSize: number
  fileHash: string
  sheets: ParsedSheet[]
}

/** A spreadsheet row after column mapping, before server validation. */
export type ImportRow = {
  rowNumber: number
  first_name: string
  last_name: string
  email: string
  phone: string
  company: string
  notes: string
  status: string
  lead_status: string
  source_id: string
  assigned_to: string
  tag_ids: string[]
  custom_data: Record<string, string>
}

export type ValidatedRow = {
  rowNumber: number
  values: ImportRow
  errors: string[]
  duplicate: DuplicateMatch | null
}

export type DuplicateMatch = {
  rowNumber: number
  contactId: string
  name: string
  matchType: 'email' | 'phone'
}

export type ImportResultRow = {
  rowNumber: number
  status: 'created' | 'updated' | 'skipped' | 'failed'
  message: string | null
  name: string
}

export type BatchResult = {
  results: ImportResultRow[]
  replayed: boolean
  created: number
  updated: number
  skipped: number
  failed: number
}

export type ImportSummary = {
  id: string
  status: string
  total_rows: number
  processed_rows: number
  created: number
  updated: number
  skipped: number
  failed: number
}

export type ImportJob = {
  id: string
  tenant_id: string
  kind: ImportKind
  file_name: string
  file_size: number
  duplicate_mode: DuplicateMode
  status: string
  total_rows: number
  processed_rows: number
  created_count: number
  updated_count: number
  skipped_count: number
  failed_count: number
  error_report: Array<{ rowNumber: number; status: string; message: string; name: string }>
  created_at: string
  completed_at: string | null
}

export type ImportOptions = {
  sources: Array<{ id: string; name: string }>
  tags: Array<{ id: string; name: string }>
  members: Array<{ user_id: string; full_name: string | null }>
  customFields: CustomFieldRow[]
}

export type ExportRow = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  company: string
  status: string
  lead_status: string
  source_name: string
  owner_name: string
  tags: string
  notes: string
  custom_data: Record<string, unknown>
  created_at: string
}

export type DuplicateSource = Pick<ContactSearchRow, 'id' | 'first_name' | 'last_name' | 'email' | 'phone'>
