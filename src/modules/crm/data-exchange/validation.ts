import type { CustomFieldRow } from '@/types/database'
import type { DuplicateMode, DuplicateSource, ImportKind, ImportRow } from './types'

export const MAX_FILE_BYTES = 5 * 1024 * 1024
export const MAX_ROWS = 5000
export const MAX_COLUMNS = 50
export const MAX_CELL_LENGTH = 500
export const BATCH_SIZE = 100
export const ALLOWED_EXTENSIONS = ['xlsx', 'xls', 'csv'] as const

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
// eslint-disable-next-line no-control-regex -- deliberate: strip control chars from untrusted cells
const CONTROL_RE = /[\u0000-\u001f\u007f]/g
const CUSTOM_PREFIX = 'custom:'

/** Strip control characters and cap length. Spreadsheet content is untrusted. */
export function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(CONTROL_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CELL_LENGTH)
}

export function normalizeEmail(value: unknown): string {
  return sanitizeCell(value).toLowerCase()
}

/** Digits only, leading zeroes removed, India's +91 prefix folded away. */
export function normalizePhone(value: unknown): string {
  let phone = sanitizeCell(value).replace(/\D/g, '')
  phone = phone.replace(/^0+/, '')
  if (phone.length === 12 && phone.startsWith('91')) phone = phone.slice(2)
  return phone
}

export function isValidEmail(value: string): boolean {
  return value.length > 0 && value.length <= 255 && EMAIL_RE.test(value)
}

export function isValidPhone(value: string): boolean {
  return value.length >= 7 && value.length <= 15 && /^\d+$/.test(value)
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/** Client-side gate. The server repeats these limits when the job is started. */
export function validateFile(file: { name: string; size: number }): string | null {
  const extension = fileExtension(file.name)
  if (!ALLOWED_EXTENSIONS.includes(extension as (typeof ALLOWED_EXTENSIONS)[number])) {
    return 'Use an .xlsx, .xls or .csv file.'
  }
  if (file.size < 1) return 'The file is empty.'
  if (file.size > MAX_FILE_BYTES) return 'The file must be 5 MB or smaller.'
  return null
}

/** Deterministic file signature used as the idempotency key. */
export function hashFile(name: string, size: number, bytes: Uint8Array): string {
  let hash = 0x811c9dc5
  const update = (value: number) => {
    hash ^= value & 0xff
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  for (let index = 0; index < name.length; index += 1) update(name.charCodeAt(index))
  update(size & 0xff)
  update((size >>> 8) & 0xff)
  update((size >>> 16) & 0xff)
  const step = Math.max(1, Math.floor(bytes.length / 4096))
  for (let index = 0; index < bytes.length; index += step) update(bytes[index] ?? 0)
  return `f1a-${hash.toString(16).padStart(8, '0')}-${size.toString(16)}`
}

const VALID_STATUSES = new Set(['lead', 'customer', 'inactive'])
const VALID_LEAD_STATUSES = new Set(['new', 'contacted', 'qualified', 'unqualified', 'converted'])

/** Per-row validation used for the preview; the RPC repeats all of these. */
export function validateImportRow(
  row: ImportRow,
  customFields: CustomFieldRow[],
  kind: ImportKind,
): string[] {
  const errors: string[] = []
  if (!row.first_name) errors.push('First name is required')
  if (row.first_name.length > 100) errors.push('First name is too long')
  if (row.last_name.length > 100) errors.push('Last name is too long')

  const email = normalizeEmail(row.email)
  if (email && !isValidEmail(email)) errors.push('Invalid email address')

  const phone = normalizePhone(row.phone)
  if (phone && !isValidPhone(phone)) errors.push('Invalid phone number')

  if (row.company.length > 150) errors.push('Company name is too long')
  if (row.notes.length > 2000) errors.push('Notes are too long')

  if (!VALID_STATUSES.has(row.status)) errors.push('Invalid contact status')
  if (!VALID_LEAD_STATUSES.has(row.lead_status)) errors.push('Invalid lead status')
  if (kind === 'leads' && row.status !== 'lead') errors.push('A lead import cannot create a customer')

  const allowed = new Set(
    customFields
      .filter((field) => field.active && field.entity_type === 'contact')
      .map((field) => field.key),
  )
  for (const key of Object.keys(row.custom_data)) {
    if (!allowed.has(key)) errors.push(`Unknown custom field: ${key}`)
  }
  if (isUuidLike(row.source_id) === false && row.source_id) errors.push('Invalid lead source')
  if (isUuidLike(row.assigned_to) === false && row.assigned_to) errors.push('Invalid owner')
  for (const tagId of row.tag_ids) {
    if (!isUuidLike(tagId)) errors.push('Invalid tag')
  }
  return errors
}

export function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

/** Best-effort duplicate preview. The server re-checks authoritatively. */
export function findDuplicate(
  row: ImportRow,
  existing: DuplicateSource[],
): { contactId: string; name: string; matchType: 'email' | 'phone' } | null {
  const email = normalizeEmail(row.email)
  const phone = normalizePhone(row.phone)

  if (email) {
    const match = existing.find((contact) => normalizeEmail(contact.email) === email)
    if (match) {
      return {
        contactId: match.id,
        name: `${match.first_name} ${match.last_name ?? ''}`.trim(),
        matchType: 'email',
      }
    }
  }
  if (phone && phone.length >= 7) {
    const match = existing.find((contact) => normalizePhone(contact.phone) === phone)
    if (match) {
      return {
        contactId: match.id,
        name: `${match.first_name} ${match.last_name ?? ''}`.trim(),
        matchType: 'phone',
      }
    }
  }
  return null
}

export function duplicateModeAllowed(mode: DuplicateMode, confirmed: boolean): boolean {
  return mode !== 'new' || confirmed
}

export function fieldKeyToCustomKey(key: string): string | null {
  return key.startsWith(CUSTOM_PREFIX) ? key.slice(CUSTOM_PREFIX.length) : null
}

export function customKeyToFieldKey(key: string): string {
  return `${CUSTOM_PREFIX}${key}`
}

/** Fuzzy header matching so most exports map without manual work. */
const HEADER_ALIASES: Record<string, string[]> = {
  first_name: ['first name', 'firstname', 'name', 'full name', 'contact name', 'first'],
  last_name: ['last name', 'lastname', 'surname'],
  email: ['email', 'email address', 'e mail', 'mail'],
  phone: ['phone', 'mobile', 'contact number', 'phone number', 'mobile number', 'tel'],
  company: ['company', 'business', 'organisation', 'organization'],
  status: ['status', 'contact status'],
  lead_status: ['lead status', 'stage', 'lead stage', 'pipeline stage'],
  source_id: ['source', 'lead source', 'source id', 'how did you hear'],
  assigned_to: ['owner', 'assigned to', 'assignee', 'sales owner', 'user'],
  tags: ['tags', 'tag', 'labels'],
  notes: ['notes', 'note', 'description', 'comments'],
}

export function guessFieldKey(header: string, customFields: CustomFieldRow[]): string {
  const normalized = sanitizeCell(header).toLowerCase().replace(/[_-]+/g, ' ').trim()
  const allAliases: Array<[string, string]> = Object.entries(HEADER_ALIASES).flatMap(
    ([field, aliases]) => aliases.map((alias) => [field, alias] as [string, string]),
  )
  for (const custom of customFields) {
    const label = custom.label.toLowerCase()
    if (normalized === label || normalized === customKeyToFieldKey(custom.key)) {
      return customKeyToFieldKey(custom.key)
    }
  }
  // Exact matches first: "last name" must not be swallowed by the "name" alias.
  const exact = allAliases.find(([, alias]) => normalized === alias)
  if (exact) return exact[0]
  const partial = allAliases.find(([, alias]) => normalized.includes(alias))
  if (partial) return partial[0]
  const customPartial = customFields.find(
    (field) => normalized.includes(field.label.toLowerCase()),
  )
  return customPartial ? customKeyToFieldKey(customPartial.key) : ''
}
