import { describe, expect, it } from 'vitest'
import { isClinicIndustry, isDentalIndustry } from './niche'

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

describe('isClinicIndustry', () => {
  it('recognises dental and medical clinic slugs', () => {
    expect(isClinicIndustry('dental-clinic')).toBe(true)
    expect(isClinicIndustry('medical-clinic')).toBe(true)
    expect(isClinicIndustry('  Medical Clinic ')).toBe(true)
    expect(isClinicIndustry('HEALTHCARE')).toBe(true)
  })

  it('does not treat ordinary businesses as clinics', () => {
    expect(isClinicIndustry('real-estate')).toBe(false)
    expect(isClinicIndustry('general-business')).toBe(false)
    expect(isClinicIndustry(null)).toBe(false)
  })
})
