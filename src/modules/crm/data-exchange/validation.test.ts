import { describe, expect, it } from 'vitest'
import type { CustomFieldRow } from '@/types/database'
import type { ImportRow } from './types'
import {
  duplicateModeAllowed,
  findDuplicate,
  hashFile,
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
  sanitizeCell,
  validateFile,
  validateImportRow,
} from './validation'

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

const row = (overrides: Partial<ImportRow> = {}): ImportRow => ({
  rowNumber: 1,
  first_name: 'Asha',
  last_name: 'Sharma',
  email: 'asha@example.com',
  phone: '9876543210',
  company: 'Smile Dental',
  notes: '',
  status: 'lead',
  lead_status: 'new',
  source_id: '',
  assigned_to: '',
  tag_ids: [],
  custom_data: {},
  ...overrides,
})

describe('spreadsheet input sanitization', () => {
  it('strips control characters and collapses whitespace', () => {
    expect(sanitizeCell('  Asha\u0000\u001f  Sharma  ')).toBe('Asha Sharma')
  })

  it('normalizes emails and Indian phone numbers', () => {
    expect(normalizeEmail('  ASHA@Example.COM ')).toBe('asha@example.com')
    expect(normalizePhone('+91 98765 43210')).toBe('9876543210')
    expect(normalizePhone('009876543210')).toBe('9876543210')
    expect(isValidEmail(normalizeEmail('asha@example.com'))).toBe(true)
    expect(isValidPhone(normalizePhone('+91 98765 43210'))).toBe(true)
    expect(isValidPhone('123')).toBe(false)
  })
})

describe('file validation', () => {
  it('accepts supported extensions only', () => {
    expect(validateFile({ name: 'leads.xlsx', size: 1024 })).toBeNull()
    expect(validateFile({ name: 'leads.xls', size: 1024 })).toBeNull()
    expect(validateFile({ name: 'leads.csv', size: 1024 })).toBeNull()
    expect(validateFile({ name: 'leads.exe', size: 1024 })).toMatch(/xlsx/)
    expect(validateFile({ name: 'leads', size: 1024 })).toMatch(/xlsx/)
  })

  it('enforces size limits', () => {
    expect(validateFile({ name: 'leads.csv', size: 0 })).toMatch(/empty/)
    expect(validateFile({ name: 'leads.csv', size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/)
  })

  it('hashes name, size and content deterministically', () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const first = hashFile('leads.csv', 4, bytes)
    expect(first).toBe(hashFile('leads.csv', 4, bytes))
    expect(first).not.toBe(hashFile('leads.csv', 5, bytes))
    expect(first).not.toBe(hashFile('leads.csv', 4, new Uint8Array([9, 9, 9, 9])))
    expect(first).not.toBe(hashFile('other.csv', 4, bytes))
  })
})

describe('row validation', () => {
  it('accepts a complete row', () => {
    expect(validateImportRow(row(), customFields, 'contacts')).toEqual([])
  })

  it('rejects missing names, bad contact details and invalid statuses', () => {
    const errors = validateImportRow(
      row({
        first_name: '',
        email: 'not-an-email',
        phone: '123',
        lead_status: 'unknown',
        status: 'vip',
      }),
      customFields,
      'contacts',
    )
    expect(errors).toContain('First name is required')
    expect(errors).toContain('Invalid email address')
    expect(errors).toContain('Invalid phone number')
    expect(errors).toContain('Invalid lead status')
    expect(errors).toContain('Invalid contact status')
  })

  it('rejects unknown custom fields and customers in a lead import', () => {
    const errors = validateImportRow(
      row({ status: 'customer', custom_data: { unknown_field: 'x' } }),
      customFields,
      'leads',
    )
    expect(errors).toContain('A lead import cannot create a customer')
    expect(errors.some((error) => error.includes('unknown_field'))).toBe(true)
  })

  it('accepts declared custom fields', () => {
    expect(
      validateImportRow(row({ custom_data: { preference: 'morning' } }), customFields, 'contacts'),
    ).toEqual([])
  })
})

describe('duplicate preview', () => {
  const existing = [
    {
      id: 'contact-1',
      first_name: 'Asha',
      last_name: 'Sharma',
      email: 'asha@example.com',
      phone: '9876543210',
    },
    {
      id: 'contact-2',
      first_name: 'Ravi',
      last_name: null,
      email: 'ravi@example.com',
      phone: '9999999999',
    },
  ]

  it('finds duplicates by email then phone', () => {
    expect(findDuplicate(row(), existing)?.matchType).toBe('email')
    expect(findDuplicate(row({ email: '', phone: '+91 99999 99999' }), existing)?.contactId).toBe('contact-2')
    expect(findDuplicate(row({ email: 'new@example.com', phone: '8888888888' }), existing)).toBeNull()
  })

  it('requires explicit confirmation for import-as-new', () => {
    expect(duplicateModeAllowed('new', false)).toBe(false)
    expect(duplicateModeAllowed('new', true)).toBe(true)
    expect(duplicateModeAllowed('skip', false)).toBe(true)
    expect(duplicateModeAllowed('update', false)).toBe(true)
  })
})
