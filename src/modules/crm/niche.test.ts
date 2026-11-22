import { describe, expect, it } from 'vitest'
import { isDentalIndustry } from './niche'

describe('isDentalIndustry', () => {
  it('recognizes the seeded dental clinic slug', () => {
    expect(isDentalIndustry('dental-clinic')).toBe(true)
  })

  it('normalizes case, whitespace and underscores', () => {
    expect(isDentalIndustry('  Dental Clinic ')).toBe(true)
    expect(isDentalIndustry('DENTAL_CLINIC')).toBe(true)
    expect(isDentalIndustry('Dentistry')).toBe(true)
  })

  it('rejects other industries and empty values', () => {
    expect(isDentalIndustry('real-estate')).toBe(false)
    expect(isDentalIndustry('general-business')).toBe(false)
    expect(isDentalIndustry('')).toBe(false)
    expect(isDentalIndustry(null)).toBe(false)
    expect(isDentalIndustry(undefined)).toBe(false)
  })
})
