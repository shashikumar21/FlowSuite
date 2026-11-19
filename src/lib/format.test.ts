import { describe, expect, it } from 'vitest'
import { formatCurrency, initials, slugify, titleCase } from './format'

describe('format helpers', () => {
  it('creates URL-safe slugs from Indian business names', () => {
    expect(slugify('Sharma Dental Clinic')).toBe('sharma-dental-clinic')
    expect(slugify('  Sai  Salon & Spa!  ')).toBe('sai-salon-spa')
    expect(slugify('Café 24/7')).toBe('cafe-24-7')
  })

  it('formats INR amounts for India', () => {
    expect(formatCurrency(2499, 'INR')).toContain('2,499')
  })

  it('builds initials from names', () => {
    expect(initials('Ananya Sharma')).toBe('AS')
    expect(initials('Ananya')).toBe('A')
    expect(initials(null)).toBe('?')
  })

  it('humanises module keys', () => {
    expect(titleCase('ai_agents')).toBe('Ai Agents')
  })
})
