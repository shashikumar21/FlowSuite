import { describe, expect, it } from 'vitest'
import {
  allowedPatientDocumentMimeTypes,
  buildPatientDocumentPath,
  displayNameFromPatientDocumentPath,
  extensionForMimeType,
  patientDocumentDeleteResultSchema,
  patientDocumentSignedUploadSchema,
  patientDocumentsResponseSchema,
  sanitizeDocumentLabel,
  validatePatientDocumentPath,
} from './patientDocuments'

const TENANT = '09902c67-e585-427c-98be-df91c211e864'
const CONTACT = 'c9860400-c373-4801-99b1-55bbca71943c'

describe('patient document helpers', () => {
  it('allows only safe document types', () => {
    expect(allowedPatientDocumentMimeTypes()).toEqual([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ])
    expect(extensionForMimeType('IMAGE/JPEG')).toBe('jpg')
    expect(extensionForMimeType('application/msword')).toBeNull()
  })

  it('sanitizes labels without keeping path characters', () => {
    const label = sanitizeDocumentLabel("../../patient's scan?.pdf")
    expect(label).not.toContain('/')
    expect(label).not.toContain("'")
    expect(label).not.toContain('..')
    expect(label).toContain('scan.pdf')
    expect(label.length).toBeLessThanOrEqual(120)
    expect(sanitizeDocumentLabel('   ')).toBe('patient-document')
  })

  it('builds tenant and contact scoped object paths with a safe label', () => {
    expect(buildPatientDocumentPath(TENANT, CONTACT, 'PDF', 'Scan 1', 'fixed-id'))
      .toBe(`${TENANT}/${CONTACT}/fixed-id-Scan 1.pdf`)
    expect(() => buildPatientDocumentPath(TENANT, CONTACT, 'exe')).toThrow('Unsupported')
    expect(() => buildPatientDocumentPath('bad', CONTACT, 'pdf')).toThrow()
  })

  it('recovers the label from an object path', () => {
    const id = 'c9860400-c373-4801-99b1-55bbca71943c'
    expect(displayNameFromPatientDocumentPath(`${TENANT}/${CONTACT}/${id}-Scan 1.pdf`))
      .toBe('Scan 1')
    expect(displayNameFromPatientDocumentPath(`${TENANT}/${CONTACT}/${id}.png`))
      .toBe(id)
  })

  it('rejects paths outside the caller tenant and contact', () => {
    const path = `${TENANT}/${CONTACT}/scan.jpg`
    expect(validatePatientDocumentPath(TENANT, CONTACT, path)).toBe(path)
    expect(() => validatePatientDocumentPath(TENANT, CONTACT, `${TENANT}/other/scan.jpg`)).toThrow()
    expect(() => validatePatientDocumentPath(TENANT, CONTACT, `other/${CONTACT}/scan.jpg`)).toThrow()
    expect(() => validatePatientDocumentPath(TENANT, CONTACT, `${TENANT}/${CONTACT}/../scan.jpg`)).toThrow()
  })
})

describe('patient document response schemas', () => {
  it('accepts valid signer responses and rejects malformed ones', () => {
    expect(patientDocumentsResponseSchema.safeParse([{
      path: `${TENANT}/${CONTACT}/scan.jpg`,
      name: 'scan.jpg',
      created_at: '2026-11-24T04:00:00.000Z',
      content_type: 'image/jpeg',
      size: 1234,
      original_name: 'scan.jpg',
      signed_url: 'https://example.test/file',
    }]).success).toBe(true)
    expect(patientDocumentsResponseSchema.safeParse([{}]).success).toBe(false)
  })

  it('rejects unsafe signed URL schemes', () => {
    const document = {
      path: `${TENANT}/${CONTACT}/scan.jpg`,
      name: 'scan.jpg',
      signed_url: 'javascript:alert(1)',
    }
    expect(patientDocumentsResponseSchema.safeParse([document]).success).toBe(false)
    expect(patientDocumentsResponseSchema.safeParse([{
      ...document,
      signed_url: 'https://example.test/file',
    }]).success).toBe(true)
  })

  it('validates signed upload and delete responses', () => {
    expect(patientDocumentSignedUploadSchema.safeParse({ path: 'a/b/scan.jpg', token: 'token' }).success).toBe(true)
    expect(patientDocumentSignedUploadSchema.safeParse({ path: 'a/b/scan.jpg' }).success).toBe(false)
    expect(patientDocumentDeleteResultSchema.safeParse({ ok: true }).success).toBe(true)
    expect(patientDocumentDeleteResultSchema.safeParse({ ok: 'yes' }).success).toBe(false)
  })
})
