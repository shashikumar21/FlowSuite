import { describe, expect, it } from 'vitest'
import { activitySchema, contactSchema, dealSchema, stageSchema } from './schemas'

const validContact = {
  first_name: 'Asha',
  last_name: 'Sharma',
  email: 'asha@example.test',
  phone: '9876543210',
  company: 'Smile Dental',
  source_id: '',
  notes: 'Referred by a patient',
  lead_status: 'new' as const,
  status: 'lead' as const,
  assigned_to: '',
  follow_up_at: '',
  clinic: 'Smile Dental Clinic',
  area: 'Andheri West',
  mobile: '+919876543210',
  rating: '4.5',
  reviews: '128',
  why_included: 'High-intent enquiry from Google Maps',
  google_maps_url: 'https://maps.google.com/?q=Smile+Dental',
  sent: false,
  reply_1: '',
}

const validDeal = {
  title: 'Smile makeover',
  contact_id: '11111111-1111-4111-8111-111111111111',
  pipeline_id: '22222222-2222-4222-8222-222222222222',
  stage_id: '33333333-3333-4333-8333-333333333333',
  value: '50000',
  currency: 'INR',
  assigned_to: '',
  expected_close_date: '',
  description: '',
}

describe('CRM form schemas', () => {
  it('accepts a valid contact and trims surrounding whitespace', () => {
    const parsed = contactSchema.parse({ ...validContact, first_name: '  Asha  ', email: ' ASHA@example.test ' })
    expect(parsed.first_name).toBe('Asha')
    expect(parsed.email).toBe('ASHA@example.test')
  })

  it('allows blank optional contact fields but rejects invalid emails', () => {
    expect(contactSchema.safeParse({ ...validContact, email: '', phone: '' }).success).toBe(true)
    expect(contactSchema.safeParse({ ...validContact, email: 'not-an-email' }).success).toBe(false)
    expect(contactSchema.safeParse({ ...validContact, first_name: '   ' }).success).toBe(false)
  })

  it('validates enrichment ratings, reviews and mobile numbers', () => {
    expect(contactSchema.parse({ ...validContact, clinic: '  Smile Dental  ' }).clinic).toBe('Smile Dental')
    expect(contactSchema.safeParse({ ...validContact, rating: '', reviews: '', mobile: '' }).success).toBe(true)
    for (const rating of ['0', '5', '4.7', '5.0']) {
      expect(contactSchema.safeParse({ ...validContact, rating }).success).toBe(true)
    }
    for (const rating of ['-1', '5.1', '4.56', '6', 'abc']) {
      expect(contactSchema.safeParse({ ...validContact, rating }).success).toBe(false)
    }
    expect(contactSchema.safeParse({ ...validContact, reviews: '0' }).success).toBe(true)
    expect(contactSchema.safeParse({ ...validContact, reviews: '-1' }).success).toBe(false)
    expect(contactSchema.safeParse({ ...validContact, reviews: '1.5' }).success).toBe(false)
    expect(contactSchema.safeParse({ ...validContact, mobile: '+91 98765 43210' }).success).toBe(true)
    expect(contactSchema.safeParse({ ...validContact, mobile: '(022) 1234-5678' }).success).toBe(true)
    expect(contactSchema.safeParse({ ...validContact, mobile: '9876543210 ext 4' }).success).toBe(false)
  })

  it('accepts blank or valid Google Maps URLs and keeps sent as a boolean', () => {
    expect(contactSchema.parse(validContact).sent).toBe(false)
    expect(contactSchema.safeParse({ ...validContact, google_maps_url: '' }).success).toBe(true)
    expect(contactSchema.safeParse({ ...validContact, google_maps_url: 'https://maps.google.com/?q=test' }).success).toBe(true)
    expect(contactSchema.safeParse({ ...validContact, google_maps_url: 'not-a-url' }).success).toBe(false)
    expect(contactSchema.safeParse({ ...validContact, google_maps_url: `https://maps.google.com/?q=${'x'.repeat(2000)}` }).success).toBe(false)
    expect(contactSchema.safeParse({ ...validContact, sent: true }).success).toBe(true)
    expect(contactSchema.safeParse({ ...validContact, sent: 'yes' }).success).toBe(false)
  })

  it('coerces deal values to numbers and rejects negative amounts', () => {
    expect(dealSchema.parse(validDeal).value).toBe(50000)
    expect(dealSchema.safeParse({ ...validDeal, value: '-1' }).success).toBe(false)
    expect(dealSchema.safeParse({ ...validDeal, contact_id: '' }).success).toBe(false)
  })

  it('requires an activity body and limits activity types to user-loggable kinds', () => {
    expect(activitySchema.safeParse({ type: 'call', subject: 'Follow-up', body: 'Spoke to patient' }).success).toBe(true)
    expect(activitySchema.safeParse({ type: 'call', subject: '', body: '' }).success).toBe(false)
    expect(activitySchema.safeParse({ type: 'stage_change', subject: '', body: 'x' }).success).toBe(false)
  })

  it('keeps stage probability within 0-100 and enforces closed/won flags', () => {
    expect(stageSchema.parse({ name: 'Won', probability: '100', is_closed: true, is_won: true, color: '' }).probability).toBe(100)
    expect(stageSchema.safeParse({ name: 'Bad', probability: '101', is_closed: false, is_won: false, color: '' }).success).toBe(false)
  })
})
