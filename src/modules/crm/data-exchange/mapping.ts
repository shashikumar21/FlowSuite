import type { ParsedSheet, ImportOptions, ImportRow } from './types'
import {
  customKeyToFieldKey,
  fieldKeyToCustomKey,
  guessFieldKey,
  isUuidLike,
  sanitizeCell,
} from './validation'

/** Column index (in the selected sheet) -> canonical field key. */
export type ColumnMapping = Record<number, string>

export const BUILTIN_FIELDS = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'company', label: 'Company' },
  { key: 'status', label: 'Contact status' },
  { key: 'lead_status', label: 'Lead status' },
  { key: 'source_id', label: 'Lead source' },
  { key: 'assigned_to', label: 'Owner' },
  { key: 'tags', label: 'Tags' },
  { key: 'notes', label: 'Notes' },
  { key: 'clinic', label: 'Clinic' },
  { key: 'area', label: 'Area' },
  { key: 'mobile', label: 'Mobile (+91)' },
  { key: 'rating', label: 'Rating' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'why_included', label: 'Why included' },
  { key: 'google_maps_url', label: 'Google Maps link' },
  { key: 'sent', label: 'Sent? (Y/N)' },
  { key: 'reply_1', label: 'Reply 1' },
] as const

/** Lead-enrichment columns are plain strings in CSV, like the built-in text fields. */
const ENRICHMENT_FIELDS: ReadonlySet<string> = new Set([
  'clinic',
  'area',
  'mobile',
  'rating',
  'reviews',
  'why_included',
  'google_maps_url',
  'sent',
  'reply_1',
])

export function availableFields(options: ImportOptions): Array<{ key: string; label: string }> {
  return [
    ...BUILTIN_FIELDS,
    ...options.customFields.map((field) => ({
      key: customKeyToFieldKey(field.key),
      label: `Custom: ${field.label}`,
    })),
  ]
}

/** Auto-map all headers by name; unmatched columns are left for the user. */
export function autoMapColumns(sheet: ParsedSheet, options: ImportOptions): ColumnMapping {
  const fields = availableFields(options)
  const mapping: ColumnMapping = {}
  const header = sheet.rows[sheet.headerRowIndex] ?? []
  header.forEach((cell, index) => {
    const guessed = guessFieldKey(cell, options.customFields)
    if (guessed && fields.some((field) => field.key === guessed)) mapping[index] = guessed
  })
  return mapping
}

function resolveSource(value: string, options: ImportOptions): string {
  if (!value) return ''
  if (isUuidLike(value)) return value
  const match = options.sources.find(
    (source) => source.name.toLowerCase() === value.toLowerCase(),
  )
  return match?.id ?? value // invalid values are flagged by the server
}

function resolveOwner(value: string, options: ImportOptions): string {
  if (!value) return ''
  if (isUuidLike(value)) return value
  const match = options.members.find(
    (member) =>
      member.user_id === value ||
      (member.full_name ?? '').toLowerCase() === value.toLowerCase(),
  )
  return match?.user_id ?? value
}

function resolveTags(value: string, options: ImportOptions): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((part) => sanitizeCell(part))
    .filter(Boolean)
    .map((name) => {
      if (isUuidLike(name)) return name
      const match = options.tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase())
      return match?.id ?? name
    })
}

/** Build normalized rows from a sheet + mapping. No writes happen here. */
export function buildMappedRows(
  sheet: ParsedSheet,
  mapping: ColumnMapping,
  options: ImportOptions,
): ImportRow[] {
  const headerRow = sheet.headerRowIndex
  const rows: ImportRow[] = []

  sheet.rows.forEach((cells, index) => {
    if (index <= headerRow) return
    const row: ImportRow = {
      rowNumber: 0,
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      company: '',
      notes: '',
      status: 'lead',
      lead_status: 'new',
      source_id: '',
      assigned_to: '',
      tag_ids: [],
      custom_data: {},
      clinic: '',
      area: '',
      mobile: '',
      rating: '',
      reviews: '',
      why_included: '',
      google_maps_url: '',
      sent: '',
      reply_1: '',
    }

    cells.forEach((cell, columnIndex) => {
      const field = mapping[columnIndex]
      if (!field) return
      const value = sanitizeCell(cell)
      if (field === 'tags') {
        row.tag_ids = resolveTags(value, options)
      } else if (field === 'source_id') {
        row.source_id = resolveSource(value, options)
      } else if (field === 'assigned_to') {
        row.assigned_to = resolveOwner(value, options)
      } else if (field === 'status') {
        row.status = value || 'lead'
      } else if (field === 'lead_status') {
        row.lead_status = value || 'new'
      } else if (ENRICHMENT_FIELDS.has(field)) {
        const target = row as unknown as Record<string, string>
        target[field] = value
      } else {
        const customKey = fieldKeyToCustomKey(field)
        if (customKey) {
          if (value) row.custom_data[customKey] = value
        } else if (field in row) (row as unknown as Record<string, unknown>)[field] = value
      }
    })

    rows.push(row)
  })

  return rows.filter(
    (row) =>
      row.first_name ||
      row.last_name ||
      row.email ||
      row.phone ||
      row.company ||
      row.notes ||
      row.source_id ||
      row.assigned_to ||
      row.tag_ids.length > 0 ||
      row.clinic ||
      row.area ||
      row.mobile ||
      row.rating ||
      row.reviews ||
      row.why_included ||
      row.google_maps_url ||
      row.sent ||
      row.reply_1 ||
      Object.keys(row.custom_data).length > 0,
  ).map((row, index) => ({ ...row, rowNumber: index + 1 }))
}

export function mappedHeaderLabel(
  sheet: ParsedSheet,
  mapping: ColumnMapping,
  options: ImportOptions,
  columnIndex: number,
): string {
  const field = mapping[columnIndex]
  const label = availableFields(options).find((item) => item.key === field)?.label
  if (label) return label
  return sheet.rows[sheet.headerRowIndex]?.[columnIndex] ?? 'Do not import'
}
