import { describe, expect, it } from 'vitest'
import {
  addCalendarDays,
  allowedStatusTransitions,
  appointmentStatusTone,
  bookingDateOptions,
  calendarDateInZone,
  createIdempotencyKey,
  filterAppointmentsByBusinessDate,
  formatDateLabel,
  formatLeadTime,
  formatSlotDateTime,
  formatSlotTime,
  formatSlotRange,
  linkedResourceIds,
  normalizeBookingMetrics,
  resolveTimeZone,
  sortAppointments,
} from './utils'
import type { AppointmentRow, ServiceResourceRow } from '@/types/database'

function appointment(id: string, startAt: string): AppointmentRow {
  return {
    id,
    tenant_id: 'tenant',
    contact_id: null,
    service_id: null,
    resource_id: null,
    booking_page_id: null,
    title: 'Visit',
    customer_name: 'Asha',
    customer_phone: null,
    customer_email: null,
    booking_source: 'staff',
    notes: null,
    start_at: startAt,
    end_at: startAt,
    status: 'confirmed',
    assigned_to: null,
    idempotency_key: null,
    manage_token: null,
    rescheduled_from: null,
    cancelled_at: null,
    cancellation_reason: null,
    confirmed_at: null,
    completed_at: null,
    metadata: {},
    created_at: startAt,
    updated_at: startAt,
  }
}

describe('booking timezone helpers', () => {
  it('derives the business calendar date with Intl, not the browser/UTC date', () => {
    const instant = new Date('2026-01-01T00:30:00Z')
    expect(calendarDateInZone(instant, 'Asia/Kolkata')).toBe('2026-01-01')
    expect(calendarDateInZone(instant, 'America/Los_Angeles')).toBe('2025-12-31')
    expect(calendarDateInZone(instant, null)).toBe('2026-01-01')
  })

  it('falls back to a safe timezone for invalid zone names', () => {
    expect(resolveTimeZone('')).toBe('Asia/Kolkata')
    expect(resolveTimeZone('Not/AZone')).toBe('Asia/Kolkata')
    expect(resolveTimeZone('America/New_York')).toBe('America/New_York')
  })

  it('adds calendar days without drifting across month or year boundaries', () => {
    expect(addCalendarDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addCalendarDays('2024-12-31', 1)).toBe('2025-01-01')
    expect(addCalendarDays('not-a-date', 1)).toBe('not-a-date')
  })

  it('lists only dates inside the booking horizon', () => {
    const now = new Date('2026-06-10T23:30:00Z') // 2026-06-11 in Kolkata
    const dates = bookingDateOptions('Asia/Kolkata', 3, now)
    expect(dates).toEqual(['2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14'])
    expect(formatDateLabel('2026-06-11')).toMatch(/Thu/)
  })

  it('formats server slot timestamps in the business zone', () => {
    const start = '2026-01-01T09:00:00Z'
    const end = '2026-01-01T09:30:00Z'
    expect(formatSlotTime(start, 'Asia/Kolkata')).toContain('2:30')
    expect(formatSlotRange(start, end, 'Asia/Kolkata')).toContain('–')
    expect(formatSlotDateTime(start, 'Asia/Kolkata')).toContain('Jan')
    expect(formatLeadTime(90)).toBe('1.5 h notice')
    expect(formatLeadTime(0)).toBe('No minimum notice')
  })

  it('filters appointment history by the business-local date', () => {
    const rows = [
      appointment('a', '2026-01-01T23:30:00Z'), // 2026-01-02 in Kolkata
      appointment('b', '2026-01-01T01:00:00Z'), // 2026-01-01 in Kolkata
    ]
    expect(filterAppointmentsByBusinessDate(rows, '2026-01-02', 'Asia/Kolkata').map((row) => row.id)).toEqual(['a'])
    expect(sortAppointments([rows[1] as AppointmentRow, rows[0] as AppointmentRow]).map((row) => row.id)).toEqual(['b', 'a'])
  })
})

describe('booking presentation helpers', () => {
  it('normalises empty and partial metric payloads to real zeros', () => {
    expect(normalizeBookingMetrics({})).toEqual({
      today_count: 0,
      upcoming_count: 0,
      pending_count: 0,
      completed_count: 0,
      cancelled_count: 0,
      no_show_count: 0,
      week_count: 0,
    })
    expect(normalizeBookingMetrics({ today_count: 4, week_count: '12', pending_count: -1 }).today_count).toBe(4)
    expect(normalizeBookingMetrics({ today_count: 4, week_count: '12', pending_count: -1 }).week_count).toBe(12)
    expect(normalizeBookingMetrics(undefined).today_count).toBe(0)
  })

  it('maps statuses to badge tones and only exposes valid transitions', () => {
    expect(appointmentStatusTone('cancelled')).toBe('neutral')
    expect(appointmentStatusTone('no_show')).toBe('danger')
    expect(allowedStatusTransitions('pending')).toEqual(['scheduled', 'confirmed', 'cancelled'])
    expect(allowedStatusTransitions('confirmed')).toContain('completed')
    expect(allowedStatusTransitions('cancelled')).toEqual([])
  })

  it('extracts service resource links and generates an idempotency key', () => {
    const links: ServiceResourceRow[] = [
      { tenant_id: 't', service_id: 's1', resource_id: 'r1', created_at: '' },
      { tenant_id: 't', service_id: 's2', resource_id: 'r2', created_at: '' },
    ]
    expect(linkedResourceIds(links, 's1')).toEqual(['r1'])
    expect(createIdempotencyKey().length).toBeGreaterThan(8)
  })
})
