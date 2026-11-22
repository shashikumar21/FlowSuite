import type { SalesAgentMetrics, SalesLeadStatus, SalesVerificationStatus } from '@/types/database'
import { leadStatusOptions, verificationStatusOptions } from './schemas'
import type { MappedImportSheet, ProspectImportRow } from './types'

/** Real, explicit zeros. Never replace with invented demo numbers. */
export const EMPTY_SALES_METRICS: SalesAgentMetrics = {
  total_prospects: 0,
  new_prospects: 0,
  verified_contacts: 0,
  active_campaigns: 0,
  emails_sent: 0,
  replies_received: 0,
  interested_prospects: 0,
  converted_customers: 0,
  saved_searches: 0,
}

export const MAX_IMPORT_ROWS = 500

const leadLabels = Object.fromEntries(
  leadStatusOptions.map((option) => [option.value, option.label]),
) as Record<SalesLeadStatus, string>

const verificationLabels = Object.fromEntries(
  verificationStatusOptions.map((option) => [option.value, option.label]),
) as Record<SalesVerificationStatus, string>

export function leadStatusLabel(status: SalesLeadStatus): string {
  return leadLabels[status] ?? status
}

export function verificationStatusLabel(status: SalesVerificationStatus): string {
  return verificationLabels[status] ?? status
}

type ColumnKey = keyof ProspectImportRow

/**
 * Accepted spreadsheet headers. Comparison is case-insensitive and treats
 * spaces, hyphens and underscores as equivalent.
 */
const COLUMN_ALIASES: Record<ColumnKey, string[]> = {
  business_name: ['business name', 'business', 'company', 'name'],
  industry: ['industry', 'sector'],
  city: ['city'],
  state: ['state', 'region'],
  country: ['country'],
  website: ['website', 'web site', 'url', 'site'],
  business_size: ['business size', 'size'],
  contact_person: ['contact person', 'contact', 'decision maker'],
  email: ['email', 'email address', 'e mail'],
  phone: ['phone', 'mobile', 'telephone'],
  notes: ['notes', 'note', 'comments'],
}

const ORDER: ColumnKey[] = [
  'business_name',
  'industry',
  'city',
  'state',
  'country',
  'website',
  'business_size',
  'contact_person',
  'email',
  'phone',
  'notes',
]

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

/** Maps a parsed sheet into rows for the `sales_import_prospects` RPC. */
export function mapImportSheet(
  sheetRows: string[][],
  headerRowIndex: number,
  maxRows = MAX_IMPORT_ROWS,
): MappedImportSheet {
  const headers = sheetRows[headerRowIndex] ?? []
  const mapping = new Map<number, ColumnKey>()
  const unmappedHeaders: string[] = []

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header)
    if (!normalized) return
    const key = ORDER.find((candidate) => COLUMN_ALIASES[candidate].includes(normalized))
    if (key) mapping.set(index, key)
    else unmappedHeaders.push(header)
  })

  if (!mapping.has(0) && !Array.from(mapping.values()).includes('business_name')) {
    throw new Error('Add a "Business name" column to the sheet before importing.')
  }

  const rows: ProspectImportRow[] = []
  const dataRows = sheetRows.slice(headerRowIndex + 1)
  for (const source of dataRows) {
    if (rows.length >= maxRows) break
    if (!source.some((cell) => cell.trim() !== '')) continue

    const row = Object.fromEntries(
      ORDER.map((key) => [key, null]),
    ) as Record<ColumnKey, string | null>
    mapping.forEach((key, index) => {
      const value = (source[index] ?? '').trim()
      row[key] = value === '' ? null : value
    })

    if (!row.business_name) continue
    rows.push(row as ProspectImportRow)
  }

  return {
    rows,
    unmappedHeaders,
    truncated: dataRows.length > rows.length && rows.length === maxRows,
  }
}

export const IMPORT_TEMPLATE_HEADERS = [
  'Business name',
  'Industry',
  'City',
  'State',
  'Country',
  'Website',
  'Business size',
  'Contact person',
  'Email',
  'Phone',
  'Notes',
]
