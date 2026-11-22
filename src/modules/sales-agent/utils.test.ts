import { describe, expect, it } from 'vitest'
import { EMPTY_SALES_METRICS, IMPORT_TEMPLATE_HEADERS, leadStatusLabel, mapImportSheet, verificationStatusLabel } from './utils'

describe('EMPTY_SALES_METRICS', () => {
  it('contains only real explicit zeros', () => {
    for (const value of Object.values(EMPTY_SALES_METRICS)) {
      expect(value).toBe(0)
    }
  })
})

describe('status labels', () => {
  it('labels lead and verification statuses', () => {
    expect(leadStatusLabel('qualified')).toBe('Qualified')
    expect(verificationStatusLabel('unverified')).toBe('Unverified')
  })
})

describe('mapImportSheet', () => {
  it('maps common header aliases and skips empty rows', () => {
    const headers = ['Company', 'Contact', 'E-mail', 'City', 'Notes']
    const result = mapImportSheet([headers, ['Smile Dental', 'Dr. Sharma', 'a@example.test', 'Mumbai', 'Referral'], ['', '', '', '', '']], 0)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      business_name: 'Smile Dental',
      contact_person: 'Dr. Sharma',
      email: 'a@example.test',
      city: 'Mumbai',
      notes: 'Referral',
    })
    expect(result.unmappedHeaders).toEqual([])
  })

  it('reports unmapped headers and tolerates a preamble row', () => {
    const result = mapImportSheet(
      [['Preamble'], ['Business name', 'Website', 'Mystery'], ['Example Clinic', 'https://www.Example.com/', 'x']],
      1,
    )
    expect(result.unmappedHeaders).toEqual(['Mystery'])
    expect(result.rows[0]?.website).toBe('https://www.Example.com/')
  })

  it('requires a business name column', () => {
    expect(() => mapImportSheet([['Company name', 'Email'], ['Example', 'a@example.test']], 0)).toThrow(/Business name/)
  })

  it('caps rows at the requested limit and flags truncation', () => {
    const rows = [['Business name'], ...Array.from({ length: 5 }, (_, index) => [`Clinic ${index}`])]
    const result = mapImportSheet(rows, 0, 2)
    expect(result.rows).toHaveLength(2)
    expect(result.truncated).toBe(true)
  })

  it('keeps the template aligned with mapped columns', () => {
    expect(IMPORT_TEMPLATE_HEADERS[0]).toBe('Business name')
  })
})
