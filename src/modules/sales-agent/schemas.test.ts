import { describe, expect, it } from 'vitest'
import { emptyProspectForm, prospectSchema, savedSearchSchema } from './schemas'

const validProspect = () => ({ ...emptyProspectForm(), business_name: 'Smile Dental Clinic' })

describe('prospectSchema', () => {
  it('accepts a valid manual prospect', () => {
    const result = prospectSchema.safeParse({
      ...emptyProspectForm(),
      business_name: 'Smile Dental Clinic',
      city: 'Mumbai',
      email: 'hello@example.test',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an empty business name', () => {
    const result = prospectSchema.safeParse({ ...emptyProspectForm(), business_name: '   ' })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid email but allows an empty one', () => {
    expect(prospectSchema.safeParse({ ...validProspect(), email: 'not-an-email' }).success).toBe(false)
    expect(prospectSchema.safeParse({ ...validProspect(), email: '' }).success).toBe(true)
  })

  it('requires a non-empty source', () => {
    expect(prospectSchema.safeParse({ ...validProspect(), source: ' ' }).success).toBe(false)
    expect(prospectSchema.safeParse(validProspect()).success).toBe(true)
  })

  it('caps free-text fields', () => {
    expect(prospectSchema.safeParse({ ...validProspect(), business_name: 'a'.repeat(201) }).success).toBe(false)
    expect(prospectSchema.safeParse({ ...validProspect(), notes: 'a'.repeat(4001) }).success).toBe(false)
  })
})

describe('savedSearchSchema', () => {
  it('requires a name', () => {
    expect(savedSearchSchema.safeParse({ name: '', industry: '', city: '' }).success).toBe(false)
  })

  it('accepts manual criteria', () => {
    expect(
      savedSearchSchema.safeParse({
        name: 'Dental clinics in Mumbai',
        industry: 'Dental',
        city: 'Mumbai',
        state: '',
        country: 'India',
        business_size: '',
        keywords: '',
      }).success,
    ).toBe(true)
  })
})
