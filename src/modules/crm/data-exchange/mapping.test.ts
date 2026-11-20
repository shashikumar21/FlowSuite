import { describe, expect, it } from 'vitest'
import type { CustomFieldRow } from '@/types/database'
import { autoMapColumns, availableFields, buildMappedRows } from './mapping'
import type { ImportOptions, ParsedSheet } from './types'

const customFields = [
  {
    id: 'cf-1',
    tenant_id: 't1',
    entity_type: 'contact',
    key: 'preference',
    label: 'Preference',
    type: 'text',
    options: [],
    required: false,
    active: true,
    position: 0,
    created_at: '',
    updated_at: '',
  },
] as CustomFieldRow[]

const options: ImportOptions = {
  sources: [{ id: 'src-1', name: 'Website' }],
  tags: [
    { id: 'tag-1', name: 'VIP' },
    { id: 'tag-2', name: 'Follow-up' },
  ],
  members: [{ user_id: 'user-1', full_name: 'Asha Sharma' }],
  customFields,
}

const sheet: ParsedSheet = {
  name: 'Contacts',
  headerRowIndex: 0,
  rows: [
    ['Full name', 'Last name', 'Email address', 'Mobile', 'Company', 'Status', 'Lead stage', 'Lead source', 'Owner', 'Tags', 'Notes', 'Preference'],
    ['Ravi', 'Verma', 'RAVI@example.com', '+91 98765 43210', 'Acme', 'lead', 'new', 'Website', 'Asha Sharma', 'VIP, Follow-up', 'Call tomorrow', 'Evening'],
    ['', '', '', '', '', '', '', '', '', '', '', ''],
    ['Meera', '', 'meera@example.com', '9999999999', '', 'lead', 'contacted', '', '', '', '', ''],
  ],
}

describe('column mapping', () => {
  it('auto-detects built-in and custom columns', () => {
    const mapping = autoMapColumns(sheet, options)
    expect(mapping[0]).toBe('first_name')
    expect(mapping[2]).toBe('email')
    expect(mapping[3]).toBe('phone')
    expect(mapping[7]).toBe('source_id')
    expect(mapping[11]).toBe('custom:preference')
    expect(availableFields(options).some((field) => field.key === 'custom:preference')).toBe(true)
  })

  it('resolves names to ids and normalizes rows without trusting the spreadsheet', () => {
    const rows = buildMappedRows(sheet, autoMapColumns(sheet, options), options)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      rowNumber: 1,
      first_name: 'Ravi',
      email: 'RAVI@example.com',
      phone: '+91 98765 43210',
      status: 'lead',
      lead_status: 'new',
      source_id: 'src-1',
      assigned_to: 'user-1',
      tag_ids: ['tag-1', 'tag-2'],
      custom_data: { preference: 'Evening' },
    })
    expect(rows[1]?.rowNumber).toBe(2)
    expect(rows[1]?.source_id).toBe('')
  })

  it('leaves unknown source names for the server to reject', () => {
    const rows = buildMappedRows(
      {
        ...sheet,
        rows: [sheet.rows[0] ?? [], ['Asha', '', '', '', '', 'lead', 'new', 'Unknown source', '', '', '', '']],
      },
      autoMapColumns(sheet, options),
      options,
    )
    expect(rows[0]?.source_id).toBe('Unknown source')
  })
})
