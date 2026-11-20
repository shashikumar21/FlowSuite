import { z } from 'zod'

/** Form schemas mirroring the validation in 0010_milestone3_booking_communication.sql. */
export const appointmentStatuses = [
  'pending',
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
] as const

export const resourceKinds = ['employee', 'room', 'equipment'] as const
export const exceptionTypes = ['blocked', 'available', 'break'] as const
export const weekDays = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
] as const

const optionalEmail = z.union([z.string().trim().email('Enter a valid email address'), z.literal('')])
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24 hour)')

export const serviceSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  description: z.string().trim().max(1000),
  duration_minutes: z.coerce.number().int().min(1, 'Duration must be at least 1 minute').max(480),
  price: z.coerce.number().finite().min(0, 'Price cannot be negative'),
  currency: z.string().trim().min(3, 'Use a 3-letter currency code').max(3).transform((value) => value.toUpperCase()),
  buffer_before_minutes: z.coerce.number().int().min(0).max(240),
  buffer_after_minutes: z.coerce.number().int().min(0).max(240),
  active: z.boolean(),
  resource_ids: z.array(z.string()),
})
export type ServiceFormValues = z.output<typeof serviceSchema>
/** Raw form shape — numeric fields start as strings from the inputs. */
export type ServiceFormInput = z.input<typeof serviceSchema>

export const resourceSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  kind: z.enum(resourceKinds),
  member_user_id: z.string(),
  notes: z.string().trim().max(1000),
  active: z.boolean(),
})
export type ResourceFormValues = z.infer<typeof resourceSchema>

/** `start_at` is always an exact ISO value returned by booking_compute_slots. */
export const appointmentSchema = z.object({
  service_id: z.string().min(1, 'Select a service'),
  date: z.string().min(1, 'Choose a date'),
  resource_id: z.string(),
  contact_id: z.string(),
  customer_name: z.string().trim().min(2, 'Customer name is required').max(160),
  customer_phone: z.string().trim().max(30),
  customer_email: optionalEmail,
  notes: z.string().trim().max(2000),
  start_at: z.string().min(1, 'Choose an available time'),
})
export type AppointmentFormValues = z.infer<typeof appointmentSchema>

export const rescheduleSchema = z.object({
  date: z.string().min(1, 'Choose a date'),
  start_at: z.string().min(1, 'Choose an available time'),
  reason: z.string().trim().max(500),
})
export type RescheduleFormValues = z.infer<typeof rescheduleSchema>

export const availabilityRuleSchema = z
  .object({
    resource_id: z.string(),
    day_of_week: z.coerce.number().int().min(0).max(6),
    start_time: timeOfDay,
    end_time: timeOfDay,
    is_active: z.boolean(),
    valid_from: z.string(),
    valid_until: z.string(),
  })
  .refine((value) => value.end_time > value.start_time, {
    message: 'End time must be after start time',
    path: ['end_time'],
  })
export type AvailabilityRuleFormValues = z.output<typeof availabilityRuleSchema>
export type AvailabilityRuleFormInput = z.input<typeof availabilityRuleSchema>

export const availabilityExceptionSchema = z
  .object({
    resource_id: z.string(),
    exception_type: z.enum(exceptionTypes),
    title: z.string().trim().max(120),
    start_at: z.string().min(1, 'Choose a start time'),
    end_at: z.string().min(1, 'Choose an end time'),
    all_day: z.boolean(),
  })
  .refine((value) => new Date(value.end_at).getTime() > new Date(value.start_at).getTime(), {
    message: 'End must be after start',
    path: ['end_at'],
  })
export type AvailabilityExceptionFormValues = z.infer<typeof availabilityExceptionSchema>

export const pageSettingsSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(120),
  description: z.string().trim().max(1000),
  primary_color: z.string().trim().max(30),
  logo_url: z.string().trim().max(500),
  lead_time_minutes: z.coerce.number().int().min(0).max(10080),
  booking_horizon_days: z.coerce.number().int().min(1).max(365),
  slot_interval_minutes: z.coerce.number().int().min(5).max(240),
  require_email: z.boolean(),
  require_phone: z.boolean(),
  allow_cancellation: z.boolean(),
  allow_rescheduling: z.boolean(),
  cancellation_hours: z.coerce.number().int().min(0).max(720),
  active: z.boolean(),
  service_ids: z.array(z.string()),
})
export type PageSettingsFormValues = z.output<typeof pageSettingsSchema>
export type PageSettingsFormInput = z.input<typeof pageSettingsSchema>

/** Required contact fields are decided by the public page settings, never by the client. */
export function makePublicBookingSchema(settings: { requireEmail: boolean; requirePhone: boolean }) {
  const email = settings.requireEmail
    ? z.string().trim().min(1, 'Email is required').email('Enter a valid email address')
    : optionalEmail
  const phone = settings.requirePhone
    ? z.string().trim().min(7, 'Enter a valid phone number').max(30)
    : z.string().trim().max(30)

  return z.object({
    customer_name: z.string().trim().min(2, 'Please enter your name').max(160),
    customer_phone: phone,
    customer_email: email,
    notes: z.string().trim().max(2000),
  })
}
export type PublicBookingFormValues = z.infer<ReturnType<typeof makePublicBookingSchema>>

export function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
