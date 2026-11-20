import { describe, expect, it } from 'vitest'
import {
  appointmentSchema,
  availabilityExceptionSchema,
  availabilityRuleSchema,
  makePublicBookingSchema,
  pageSettingsSchema,
  serviceSchema,
  toDateTimeLocal,
} from './schemas'

const validService = {
  name: '  Consultation  ',
  description: '',
  duration_minutes: '30',
  price: '1500',
  currency: 'inr',
  buffer_before_minutes: '0',
  buffer_after_minutes: '10',
  active: true,
  resource_ids: [],
}

describe('booking form schemas', () => {
  it('coerces numeric inputs and trims service values like the RPC does', () => {
    const parsed = serviceSchema.parse(validService)
    expect(parsed.name).toBe('Consultation')
    expect(parsed.duration_minutes).toBe(30)
    expect(parsed.price).toBe(1500)
    expect(parsed.currency).toBe('INR')
  })

  it('rejects durations outside the database check constraint', () => {
    expect(serviceSchema.safeParse({ ...validService, duration_minutes: '0' }).success).toBe(false)
    expect(serviceSchema.safeParse({ ...validService, duration_minutes: '481' }).success).toBe(false)
    expect(serviceSchema.safeParse({ ...validService, price: '-5' }).success).toBe(false)
  })

  it('requires a server-provided slot for staff appointments', () => {
    const base = {
      service_id: 'service',
      date: '2026-01-01',
      resource_id: '',
      contact_id: '',
      customer_name: 'Asha Sharma',
      customer_phone: '',
      customer_email: '',
      notes: '',
      start_at: '2026-01-01T09:00:00Z',
    }
    expect(appointmentSchema.safeParse(base).success).toBe(true)
    expect(appointmentSchema.safeParse({ ...base, start_at: '' }).success).toBe(false)
    expect(appointmentSchema.safeParse({ ...base, customer_name: 'A' }).success).toBe(false)
  })

  it('enforces PostgreSQL weekday and time ordering for availability rules', () => {
    const base = {
      resource_id: '',
      day_of_week: '0',
      start_time: '09:00',
      end_time: '17:00',
      is_active: true,
      valid_from: '',
      valid_until: '',
    }
    expect(availabilityRuleSchema.safeParse(base).success).toBe(true)
    expect(availabilityRuleSchema.safeParse({ ...base, day_of_week: '7' }).success).toBe(false)
    expect(availabilityRuleSchema.safeParse({ ...base, end_time: '08:00' }).success).toBe(false)
    expect(availabilityRuleSchema.safeParse({ ...base, start_time: '9:00' }).success).toBe(false)
  })

  it('validates exception windows', () => {
    const base = {
      resource_id: '',
      exception_type: 'blocked' as const,
      title: 'Holiday',
      start_at: '2026-01-01T09:00',
      end_at: '2026-01-01T17:00',
      all_day: true,
    }
    expect(availabilityExceptionSchema.safeParse(base).success).toBe(true)
    expect(availabilityExceptionSchema.safeParse({ ...base, exception_type: 'other' }).success).toBe(false)
    expect(availabilityExceptionSchema.safeParse({ ...base, end_at: '2026-01-01T08:00' }).success).toBe(false)
  })

  it('follows the public page required-contact flags', () => {
    const details = {
      customer_name: 'Asha Sharma',
      customer_phone: '9876543210',
      customer_email: 'asha@example.test',
      notes: '',
    }
    const strict = makePublicBookingSchema({ requireEmail: true, requirePhone: true })
    const relaxed = makePublicBookingSchema({ requireEmail: false, requirePhone: false })
    expect(strict.safeParse(details).success).toBe(true)
    expect(strict.safeParse({ ...details, customer_email: '' }).success).toBe(false)
    expect(relaxed.safeParse({ ...details, customer_email: '', customer_phone: '' }).success).toBe(true)
    expect(relaxed.safeParse({ ...details, customer_email: 'bad' }).success).toBe(false)
  })

  it('keeps page settings inside the migration ranges', () => {
    const base = {
      title: 'Book an appointment',
      description: '',
      primary_color: '#4f46e5',
      logo_url: '',
      lead_time_minutes: '60',
      booking_horizon_days: '60',
      slot_interval_minutes: '15',
      require_email: true,
      require_phone: true,
      allow_cancellation: true,
      allow_rescheduling: true,
      cancellation_hours: '4',
      active: true,
      service_ids: [],
    }
    expect(pageSettingsSchema.safeParse(base).success).toBe(true)
    expect(pageSettingsSchema.safeParse({ ...base, booking_horizon_days: '0' }).success).toBe(false)
    expect(pageSettingsSchema.safeParse({ ...base, slot_interval_minutes: '4' }).success).toBe(false)
  })

  it('converts ISO timestamps to datetime-local inputs for editing', () => {
    expect(toDateTimeLocal(null)).toBe('')
    expect(toDateTimeLocal('2026-01-01T00:00:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })
})
