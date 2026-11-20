import { describe, expect, it } from 'vitest'
import type { CustomFieldRow } from '@/types/database'
import { autoMapColumns, availableFields, buildMappedRows, mappedHeaderLabel } from './mapping'
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

const enrichmentSheet: ParsedSheet = {
  name: 'Enriched contacts',
  headerRowIndex: 0,
  rows: [
    ['First name', 'Mobile (+91)', 'Mobile', 'Clinic', 'Area', 'Rating', 'Reviews', 'Why included', 'Google Maps link', 'Sent? (Y/N)', 'Reply 1'],
    ['Ravi', '+91 98765 43210', '9876543210', 'Example Clinic', 'Andheri West', '4.5', '120', 'Near metro', 'https://maps.example.com/place', 'Y', 'Follow-up sent'],
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

  it('maps Mobile (+91) to mobile but plain Mobile to phone', () => {
    const mapping = autoMapColumns(enrichmentSheet, options)
    expect(mapping[1]).toBe('mobile')
    expect(mapping[2]).toBe('phone')
    expect(mappedHeaderLabel(enrichmentSheet, mapping, options, 1)).toBe('Mobile (+91)')
    expect(mappedHeaderLabel(enrichmentSheet, mapping, options, 2)).toBe('Phone')
    expect(availableFields(options).map((field) => field.label)).toEqual(
      expect.arrayContaining([
        'Clinic',
        'Area',
        'Mobile (+91)',
        'Rating',
        'Reviews',
        'Why included',
        'Google Maps link',
        'Sent? (Y/N)',
        'Reply 1',
      ]),
    )
  })

  it('carries all nine enrichment fields into mapped rows', () => {
    const rows = buildMappedRows(enrichmentSheet, autoMapColumns(enrichmentSheet, options), options)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      clinic: 'Example Clinic',
      area: 'Andheri West',
      mobile: '+91 98765 43210',
      rating: '4.5',
      reviews: '120',
      why_included: 'Near metro',
      google_maps_url: 'https://maps.example.com/place',
      sent: 'Y',
      reply_1: 'Follow-up sent',
    })
  })

  it('keeps rows that only contain enrichment values', () => {
    const rows = buildMappedRows(
      {
        ...enrichmentSheet,
        rows: [
          enrichmentSheet.rows[0] ?? [],
          ['', '', '', 'Example Clinic', '', '', '', '', '', '', ''],
        ],
      },
      autoMapColumns(enrichmentSheet, options),
      options,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.clinic).toBe('Example Clinic')
  })
})
