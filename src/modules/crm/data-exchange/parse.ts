import type { CustomFieldRow } from '@/types/database'
import type { ParsedSheet, ParsedWorkbook } from './types'
import {
  hashFile,
  MAX_AREA_LENGTH,
  MAX_CELL_LENGTH,
  MAX_CLINIC_LENGTH,
  MAX_COLUMNS,
  MAX_REPLY_1_LENGTH,
  MAX_ROWS,
  MAX_WHY_INCLUDED_LENGTH,
  sanitizeCell,
  validateFile,
} from './validation'

/** Only parseable rows are returned; formulas are never evaluated. */
export async function parseWorkbook(file: File): Promise<ParsedWorkbook> {
  const fileError = validateFile(file)
  if (fileError) throw new Error(fileError)

  const buffer = new Uint8Array(await file.arrayBuffer())
  const { read, utils } = await import('./sheet')
  const workbook = read(buffer, {
    type: 'array',
    cellFormula: false,
    sheetRows: MAX_ROWS + 5,
  })

  const sheets: ParsedSheet[] = workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name]
    if (!worksheet) return { name, rows: [], headerRowIndex: 0 }
    const matrix = utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      blankrows: false,
      raw: false,
      defval: '',
    })
    const rows = matrix
      .map((row) => row.slice(0, MAX_COLUMNS).map(sanitizeCell))
      .filter((row) => row.some((cell) => cell !== ''))
      .slice(0, MAX_ROWS)
    if (rows.length > MAX_ROWS) {
      throw new Error(`A worksheet cannot contain more than ${MAX_ROWS} rows.`)
    }
    let headerRowIndex = 0
    for (let index = 0; index < Math.min(rows.length, 10); index += 1) {
      if ((rows[index] ?? []).filter((cell) => cell !== '').length >= 2) {
        headerRowIndex = index
        break
      }
    }
    return { name, rows, headerRowIndex }
  })

  const useful = sheets.filter((sheet) => sheet.rows.length > 1)
  if (useful.length === 0) {
    throw new Error('The file has no worksheet with a header row and data.')
  }

  return {
    fileName: sanitizeCell(file.name).slice(0, 255),
    fileSize: file.size,
    fileHash: hashFile(file.name, file.size, buffer),
    sheets: useful,
  }
}

/** A downloadable .xlsx template with example rows and a field guide. */
export async function downloadSampleTemplate(customFields: CustomFieldRow[]): Promise<void> {
  const { utils, writeFileXLSX } = await import('./sheet')
  const workbook = utils.book_new()
  const fields = customFields
    .filter((field) => field.active && field.entity_type === 'contact')
    .map((field) => field.key)

  const headers = [
    'First name',
    'Last name',
    'Email',
    'Phone',
    'Company',
    'Status',
    'Lead status',
    'Source',
    'Owner',
    'Tags',
    'Notes',
    'Clinic',
    'Area',
    'Mobile (+91)',
    'Rating',
    'Reviews',
    'Why included',
    'Google Maps link',
    'Sent? (Y/N)',
    'Reply 1',
    ...fields.map((key) => `custom:${key}`),
  ]
  const example = [
    'Asha',
    'Sharma',
    'asha@example.com',
    '9876543210',
    'Smile Dental',
    'lead',
    'new',
    'Website',
    '',
    'Follow-up',
    'Website enquiry',
    'Example Clinic',
    'Andheri West',
    '+919876543210',
    '4.5',
    '120',
    'Near metro',
    'https://maps.example.com/place',
    'N',
    'Follow-up sent',
    ...fields.map(() => ''),
  ]
  const sheet = utils.aoa_to_sheet([headers, example])
  utils.book_append_sheet(workbook, sheet, 'Contacts')

  const guide = utils.aoa_to_sheet([
    ['Column', 'CRM field', 'Required', 'Notes'],
    ['First name', 'first_name', 'Yes', `Maximum ${MAX_CELL_LENGTH} characters.`],
    ['Last name', 'last_name', 'No', 'Optional.'],
    ['Email', 'email', 'No', 'Must be a valid email address.'],
    ['Phone', 'phone', 'No', '7-15 digits. +91 and leading zeroes are accepted.'],
    ['Company', 'company', 'No', 'Optional.'],
    ['Status', 'status', 'No', 'lead, customer or inactive. Defaults to lead.'],
    ['Lead status', 'lead_status', 'No', 'new, contacted, qualified, unqualified or converted.'],
    ['Source', 'source_id', 'No', 'Exact name of an active lead source, or its id.'],
    ['Owner', 'assigned_to', 'No', 'Exact name or email of an active team member.'],
    ['Tags', 'tag_ids', 'No', 'Comma-separated names of existing tags.'],
    ['Notes', 'notes', 'No', 'Optional free text.'],
    ['Clinic', 'clinic', 'No', `Optional. Maximum ${MAX_CLINIC_LENGTH} characters.`],
    ['Area', 'area', 'No', `Optional. Maximum ${MAX_AREA_LENGTH} characters.`],
    ['Mobile (+91)', 'mobile', 'No', 'Indian mobile in +91 format, e.g. +919876543210. A 10-digit number gets +91 added.'],
    ['Rating', 'rating', 'No', 'Decimal from 0 to 5 with at most one decimal place.'],
    ['Reviews', 'reviews', 'No', 'Non-negative whole number.'],
    ['Why included', 'why_included', 'No', `Optional. Maximum ${MAX_WHY_INCLUDED_LENGTH} characters.`],
    ['Google Maps link', 'google_maps_url', 'No', 'A valid http or https URL.'],
    ['Sent? (Y/N)', 'sent', 'No', 'Y or N; yes/no, true/false and 1/0 are accepted. Blank means N.'],
    ['Reply 1', 'reply_1', 'No', `Optional. Maximum ${MAX_REPLY_1_LENGTH} characters.`],
    ...fields.map((key) => [`custom:${key}`, `custom:${key}`, 'No', 'Must match a configured custom field key.']),
  ])
  utils.book_append_sheet(workbook, guide, 'Field guide')
  writeFileXLSX(workbook, 'flowsuite-import-template.xlsx')
}
