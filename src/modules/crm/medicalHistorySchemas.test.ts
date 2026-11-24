import { describe, expect, it } from 'vitest'
import {
  medicalHistoryEntriesSchema,
  medicalHistoryFormSchema,
} from './medicalHistorySchemas'

const valid = {
  allergies: 'Penicillin',
  conditions: '',
  medications: '',
  past_treatments: '',
  family_history: '',
  notes: '',
  consent_given: true,
}

describe('medical history schemas', () => {
  it('accepts a consented entry', () => {
    expect(medicalHistoryFormSchema.parse(valid)).toMatchObject({ allergies: 'Penicillin', consent_given: true })
  })

  it('rejects an entry without patient consent', () => {
    const result = medicalHistoryFormSchema.safeParse({ ...valid, consent_given: false })
    expect(result.success).toBe(false)
  })

  it('rejects values longer than the database limits', () => {
    expect(medicalHistoryFormSchema.safeParse({ ...valid, allergies: 'x'.repeat(2001) }).success).toBe(false)
    expect(medicalHistoryFormSchema.safeParse({ ...valid, notes: 'x'.repeat(4001) }).success).toBe(false)
  })

  it('validates RPC response rows', () => {
    expect(medicalHistoryEntriesSchema.safeParse([]).success).toBe(true)
    expect(medicalHistoryEntriesSchema.safeParse([{ id: 'not-a-uuid' }]).success).toBe(false)
  })
})
