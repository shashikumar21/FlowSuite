import { formatCurrency } from '@/lib/format'
import type {
  AppointmentRow,
  AppointmentStatus,
  BookingMetrics,
  BookingSlot,
  ServiceResourceRow,
} from '@/types/database'

export const DEFAULT_BUSINESS_TIMEZONE = 'Asia/Kolkata'

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

export const EMPTY_BOOKING_METRICS: BookingMetrics = {
  today_count: 0,
  upcoming_count: 0,
  pending_count: 0,
  completed_count: 0,
  cancelled_count: 0,
  no_show_count: 0,
  week_count: 0,
}

/** Invalid timezone names fall back instead of throwing in the middle of a render. */
export function resolveTimeZone(timeZone: string | null | undefined): string {
  const value = timeZone?.trim() || DEFAULT_BUSINESS_TIMEZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return value
  } catch {
    return DEFAULT_BUSINESS_TIMEZONE
  }
}

/** Business-local calendar date, derived with Intl (never UTC `toISOString`). */
export function calendarDateInZone(value: string | Date, timeZone: string | null | undefined): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  if (!year || !month || !day) return ''
  return `${year}-${month}-${day}`
}

export function todayInZone(timeZone: string | null | undefined, now: Date = new Date()): string {
  return calendarDateInZone(now, timeZone)
}

function parseCalendarDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

/** Pure calendar arithmetic on a business-local date string; no timezone drift. */
export function addCalendarDays(value: string, days: number): string {
  const parsed = parseCalendarDate(value)
  if (!parsed) return value
  const next = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days))
  if (Number.isNaN(next.getTime())) return value
  const year = next.getUTCFullYear()
  const month = String(next.getUTCMonth() + 1).padStart(2, '0')
  const day = String(next.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Inclusive list of business-local dates the server allows for this page. */
export function bookingDateOptions(
  timeZone: string | null | undefined,
  horizonDays: number,
  now: Date = new Date(),
): string[] {
  const today = todayInZone(timeZone, now)
  if (!today) return []
  const horizon = Number.isFinite(horizonDays)
    ? Math.max(1, Math.min(365, Math.floor(horizonDays)))
    : 60
  return Array.from({ length: horizon + 1 }, (_, index) => addCalendarDays(today, index))
}

/** Business-local month key (YYYY-MM) used by the appointment calendar. */
export function monthKeyFromDate(value: string): string {
  return /^(\d{4})-(\d{2})-(\d{2})$/.test(value) ? value.slice(0, 7) : ''
}

/** Pure month arithmetic; always returns the first of the target month. */
export function shiftMonth(month: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return month
  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + delta, 1))
  const year = next.getUTCFullYear()
  const monthPart = String(next.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${monthPart}`
}

export function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return month
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(date)
}

/**
 * Six Sunday-to-Saturday weeks around the month, as business-local date strings.
 * UTC arithmetic keeps the grid stable even when the browser zone differs.
 */
export function monthGrid(month: string): string[] {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return []
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const first = new Date(Date.UTC(year, monthIndex, 1))
  const start = new Date(Date.UTC(year, monthIndex, 1 - first.getUTCDay()))
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start.getTime() + index * 86_400_000)
    return `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(day.getUTCDate()).padStart(2, '0')}`
  })
}

/** Groups appointments by their business-local calendar date, sorted by start time. */
export function groupAppointmentsByDate(
  appointments: AppointmentRow[],
  timeZone: string | null | undefined,
): Map<string, AppointmentRow[]> {
  const grouped = new Map<string, AppointmentRow[]>()
  for (const appointment of appointments) {
    const key = calendarDateInZone(appointment.start_at, timeZone)
    if (!key) continue
    const rows = grouped.get(key) ?? []
    rows.push(appointment)
    grouped.set(key, rows)
  }
  for (const rows of grouped.values()) rows.sort((a, b) => a.start_at.localeCompare(b.start_at))
  return grouped
}

/** Weekday labels are derived in UTC so they match the calendar date in any zone. */
export function formatDateLabel(value: string): string {
  const parsed = parseCalendarDate(value)
  if (!parsed) return value
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day))
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date)
}

export function formatSlotTime(iso: string, timeZone: string | null | undefined): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: resolveTimeZone(timeZone),
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function formatSlotDateTime(iso: string, timeZone: string | null | undefined): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: resolveTimeZone(timeZone),
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function formatSlotRange(start: string, end: string, timeZone: string | null | undefined): string {
  return `${formatSlotTime(start, timeZone)} – ${formatSlotTime(end, timeZone)}`
}

export function formatLeadTime(minutes: number): string {
  const value = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0
  if (value === 0) return 'No minimum notice'
  if (value < 60) return `${value} min notice`
  const hours = value / 60
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h notice`
}

export function formatPrice(amount: number, currency: string | null | undefined): string {
  return formatCurrency(Number.isFinite(amount) ? amount : 0, currency?.trim() || 'INR')
}

/** RPCs can return `{}` for inactive tenants; never render undefined counters. */
export function normalizeBookingMetrics(value: unknown): BookingMetrics {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const result: BookingMetrics = { ...EMPTY_BOOKING_METRICS }
  const keys: Array<keyof BookingMetrics> = [
    'today_count',
    'upcoming_count',
    'pending_count',
    'completed_count',
    'cancelled_count',
    'no_show_count',
    'week_count',
  ]
  for (const key of keys) {
    const parsed = Number(source[key] ?? 0)
    result[key] = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
  }
  return result
}

const STATUS_TONES: Record<AppointmentStatus, BadgeTone> = {
  pending: 'warning',
  scheduled: 'brand',
  confirmed: 'brand',
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'danger',
}

export function appointmentStatusLabel(status: AppointmentStatus): string {
  return status === 'no_show' ? 'No show' : status.charAt(0).toUpperCase() + status.slice(1)
}

export function appointmentStatusTone(status: AppointmentStatus): BadgeTone {
  return STATUS_TONES[status] ?? 'neutral'
}

/** Mirrors booking_set_status in the migration; invalid transitions are hidden in the UI. */
export function allowedStatusTransitions(status: AppointmentStatus): AppointmentStatus[] {
  switch (status) {
    case 'pending':
      return ['scheduled', 'confirmed', 'cancelled']
    case 'scheduled':
      return ['confirmed', 'completed', 'cancelled', 'no_show']
    case 'confirmed':
      return ['completed', 'cancelled', 'no_show']
    default:
      return []
  }
}

export function isOpenAppointment(status: AppointmentStatus): boolean {
  return status !== 'cancelled' && status !== 'no_show'
}

export function sortAppointments<T extends AppointmentRow>(rows: T[], ascending = true): T[] {
  return [...rows].sort((a, b) =>
    ascending ? a.start_at.localeCompare(b.start_at) : b.start_at.localeCompare(a.start_at),
  )
}

export function filterAppointmentsByBusinessDate<T extends AppointmentRow>(
  rows: T[],
  date: string,
  timeZone: string | null | undefined,
): T[] {
  if (!date) return rows
  return rows.filter((row) => calendarDateInZone(row.start_at, timeZone) === date)
}

export function linkedResourceIds(links: ServiceResourceRow[], serviceId: string): string[] {
  return links.filter((link) => link.service_id === serviceId).map((link) => link.resource_id)
}

export function slotIdentity(slot: BookingSlot): string {
  return `${slot.start}::${slot.resource_id}`
}

export function createIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

export function dateTimeLocalToIso(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
