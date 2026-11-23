import { z } from 'zod'
import { requireSupabase } from '@/integrations/supabase/client'
import type {
  AppointmentRow,
  AppointmentStatus,
  AvailabilityExceptionRow,
  AvailabilityRuleRow,
  BookingMetrics,
  BookingPageRow,
  BookingResourceRow,
  BookingSlot,
  MemberStatus,
  PublicBookingManageResult,
  PublicBookingPage,
  PublicBookingResult,
  ServiceResourceRow,
  ServiceRow,
  TenantRole,
} from '@/types/database'
import type { PageSettingsFormValues } from './schemas'
import { DEFAULT_BUSINESS_TIMEZONE, filterAppointmentsByBusinessDate, normalizeBookingMetrics } from './utils'

export type MemberOption = {
  user_id: string
  full_name: string | null
  role: TenantRole
  status: MemberStatus
}

export type BookingOptions = {
  services: ServiceRow[]
  resources: BookingResourceRow[]
  serviceResources: ServiceResourceRow[]
  members: MemberOption[]
  bookingPage: BookingPageRow | null
}

export type AppointmentFilters = {
  status?: AppointmentStatus
  /** Business-local calendar date (YYYY-MM-DD), filtered after the timezone-aware read. */
  date?: string
  timeZone?: string
  upcomingOnly?: boolean
  limit?: number
}

export type PageSettings = {
  page: BookingPageRow | null
  serviceIds: string[]
  onlineBookingsEnabled: boolean
}

export type SlotOptions = {
  intervalMinutes?: number
  leadTimeMinutes?: number
  excludeAppointment?: string | null
}

function firstError(...results: Array<{ error: { message: string } | null }>) {
  return results.find((result) => result.error)?.error ?? null
}

// ---------------------------------------------------------------------------
// Authenticated reads
// ---------------------------------------------------------------------------

export async function fetchBookingMetrics(tenantId: string): Promise<BookingMetrics> {
  const { data, error } = await requireSupabase().rpc('booking_dashboard_metrics', { p_tenant: tenantId })
  if (error) throw error
  return normalizeBookingMetrics(data)
}

export async function fetchAppointments(
  tenantId: string,
  filters: AppointmentFilters = {},
): Promise<AppointmentRow[]> {
  let query = requireSupabase()
    .from('appointments')
    .select('*')
    .eq('tenant_id', tenantId)

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.upcomingOnly) query = query.gte('start_at', new Date().toISOString())

  const { data, error } = await query
    .order('start_at', { ascending: true })
    .limit(Math.min(500, Math.max(1, filters.limit ?? 200)))
    .returns<AppointmentRow[]>()
  if (error) throw error

  return filterAppointmentsByBusinessDate(
    data ?? [],
    filters.date ?? '',
    filters.timeZone ?? DEFAULT_BUSINESS_TIMEZONE,
  )
}

export async function fetchBookingOptions(tenantId: string): Promise<BookingOptions> {
  const supabase = requireSupabase()
  const [services, resources, serviceResources, members, bookingPage] = await Promise.all([
    supabase
      .from('services')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name')
      .returns<ServiceRow[]>(),
    supabase
      .from('booking_resources')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name')
      .returns<BookingResourceRow[]>(),
    supabase
      .from('service_resources')
      .select('*')
      .eq('tenant_id', tenantId)
      .returns<ServiceResourceRow[]>(),
    supabase
      .from('business_members')
      .select('user_id, role, status, profiles(full_name)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .returns<Array<{ user_id: string; role: TenantRole; status: MemberStatus; profiles: { full_name: string | null } | null }>>(),
    supabase
      .from('booking_pages')
      .select('*')
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle()
      .returns<BookingPageRow | null>(),
  ])
  const error = firstError(services, resources, serviceResources, members, bookingPage)
  if (error) throw error

  return {
    services: services.data ?? [],
    resources: resources.data ?? [],
    serviceResources: serviceResources.data ?? [],
    members: (members.data ?? []).map((member) => ({
      user_id: member.user_id,
      full_name: member.profiles?.full_name ?? null,
      role: member.role,
      status: member.status,
    })),
    bookingPage: bookingPage.data,
  }
}

export async function fetchAvailability(
  tenantId: string,
): Promise<{ rules: AvailabilityRuleRow[]; exceptions: AvailabilityExceptionRow[] }> {
  const supabase = requireSupabase()
  const [rules, exceptions] = await Promise.all([
    supabase
      .from('availability_rules')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('day_of_week')
      .order('start_time')
      .returns<AvailabilityRuleRow[]>(),
    supabase
      .from('availability_exceptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('start_at')
      .returns<AvailabilityExceptionRow[]>(),
  ])
  const error = firstError(rules, exceptions)
  if (error) throw error
  return { rules: rules.data ?? [], exceptions: exceptions.data ?? [] }
}

/** Small contact list for optional linking when staff create an appointment. */
export async function fetchBookingContacts(
  tenantId: string,
): Promise<Array<{ id: string; first_name: string; last_name: string | null }>> {
  const { data, error } = await requireSupabase()
    .from('contacts')
    .select('id, first_name, last_name')
    .eq('tenant_id', tenantId)
    .order('first_name')
    .limit(500)
    .returns<Array<{ id: string; first_name: string; last_name: string | null }>>()
  if (error) throw error
  return data ?? []
}

export async function fetchBookingPage(tenantId: string): Promise<BookingPageRow | null> {
  const { data, error } = await requireSupabase()
    .from('booking_pages')
    .select('*')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle()
    .returns<BookingPageRow | null>()
  if (error) throw error
  return data
}

export async function fetchPageSettings(tenantId: string): Promise<PageSettings> {
  const supabase = requireSupabase()
  const [page, settings] = await Promise.all([
    supabase
      .from('booking_pages')
      .select('*, booking_page_services(service_id)')
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle()
      .returns<(BookingPageRow & { booking_page_services: Array<{ service_id: string }> }) | null>(),
    supabase
      .from('business_settings')
      .select('enable_online_bookings')
      .eq('tenant_id', tenantId)
      .maybeSingle()
      .returns<{ enable_online_bookings: boolean } | null>(),
  ])
  const error = firstError(page, settings)
  if (error) throw error
  return {
    page: page.data,
    serviceIds: (page.data?.booking_page_services ?? []).map((link) => link.service_id),
    onlineBookingsEnabled: settings.data?.enable_online_bookings ?? true,
  }
}

/** Slots are always produced by the server's availability engine. */
export async function fetchSlots(
  tenantId: string,
  serviceId: string,
  date: string,
  resourceId: string | null,
  options: SlotOptions = {},
): Promise<BookingSlot[]> {
  const { data, error } = await requireSupabase().rpc('booking_compute_slots', {
    p_tenant: tenantId,
    p_service_id: serviceId,
    p_resource_id: resourceId || null,
    p_date: date,
    p_interval_minutes: options.intervalMinutes ?? 15,
    p_lead_time_minutes: options.leadTimeMinutes ?? 60,
    p_exclude_appointment: options.excludeAppointment ?? null,
  })
  if (error) throw error
  return data ?? []
}

// ---------------------------------------------------------------------------
// Authenticated config and appointment writes
// ---------------------------------------------------------------------------

export type ServiceInput = {
  name: string
  description: string
  duration_minutes: number
  price: number
  currency: string
  buffer_before_minutes: number
  buffer_after_minutes: number
  active: boolean
}

export async function createService(tenantId: string, values: ServiceInput): Promise<string> {
  const { data, error } = await requireSupabase().rpc('booking_create_service', {
    p_tenant: tenantId,
    p_name: values.name,
    p_description: values.description || null,
    p_duration_minutes: values.duration_minutes,
    p_price: values.price,
    p_currency: values.currency,
    p_buffer_before_minutes: values.buffer_before_minutes,
    p_buffer_after_minutes: values.buffer_after_minutes,
    p_active: values.active,
  })
  if (error) throw error
  return data
}

export async function updateService(tenantId: string, serviceId: string, values: ServiceInput): Promise<void> {
  const { error } = await requireSupabase().rpc('booking_update_service', {
    p_tenant: tenantId,
    p_service: serviceId,
    p_name: values.name,
    p_description: values.description || null,
    p_duration_minutes: values.duration_minutes,
    p_price: values.price,
    p_currency: values.currency,
    p_buffer_before_minutes: values.buffer_before_minutes,
    p_buffer_after_minutes: values.buffer_after_minutes,
    p_active: values.active,
  })
  if (error) throw error
}

export async function setServiceActive(tenantId: string, serviceId: string, active: boolean): Promise<void> {
  const { error } = await requireSupabase().rpc('booking_set_service_active', {
    p_tenant: tenantId,
    p_service: serviceId,
    p_active: active,
  })
  if (error) throw error
}

export async function setServiceResources(
  tenantId: string,
  serviceId: string,
  resourceIds: string[],
): Promise<void> {
  const { error } = await requireSupabase().rpc('booking_set_service_resources', {
    p_tenant: tenantId,
    p_service: serviceId,
    p_resource_ids: resourceIds,
  })
  if (error) throw error
}

export type ResourceInput = {
  name: string
  kind: 'employee' | 'room' | 'equipment'
  member_user_id: string
  notes: string
  active: boolean
}

export async function createResource(tenantId: string, values: ResourceInput): Promise<string> {
  const { data, error } = await requireSupabase().rpc('booking_create_resource', {
    p_tenant: tenantId,
    p_name: values.name,
    p_kind: values.kind,
    p_member_user_id: values.member_user_id || null,
    p_notes: values.notes || null,
    p_active: values.active,
  })
  if (error) throw error
  return data
}

export async function updateResource(
  tenantId: string,
  resourceId: string,
  values: ResourceInput,
): Promise<void> {
  const { error } = await requireSupabase().rpc('booking_update_resource', {
    p_tenant: tenantId,
    p_resource: resourceId,
    p_name: values.name,
    p_kind: values.kind,
    p_member_user_id: values.member_user_id || null,
    p_notes: values.notes || null,
    p_active: values.active,
  })
  if (error) throw error
}

export type RuleInput = {
  resource_id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_active: boolean
  valid_from: string
  valid_until: string
}

export async function upsertAvailabilityRule(
  tenantId: string,
  values: RuleInput,
  ruleId?: string | null,
): Promise<string> {
  const { data, error } = await requireSupabase().rpc('booking_upsert_availability_rule', {
    p_tenant: tenantId,
    p_rule: ruleId ?? null,
    p_resource_id: values.resource_id || null,
    p_day_of_week: values.day_of_week,
    p_start_time: values.start_time,
    p_end_time: values.end_time,
    p_is_active: values.is_active,
    p_valid_from: values.valid_from || null,
    p_valid_until: values.valid_until || null,
  })
  if (error) throw error
  return data
}

export async function deleteAvailabilityRule(tenantId: string, ruleId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('booking_delete_availability_rule', {
    p_tenant: tenantId,
    p_rule: ruleId,
  })
  if (error) throw error
}

export type ExceptionInput = {
  resource_id: string
  exception_type: 'blocked' | 'available' | 'break'
  title: string
  start_at: string
  end_at: string
  all_day: boolean
}

export async function createException(tenantId: string, values: ExceptionInput): Promise<string> {
  const { data, error } = await requireSupabase().rpc('booking_create_exception', {
    p_tenant: tenantId,
    p_resource_id: values.resource_id || null,
    p_exception_type: values.exception_type,
    p_title: values.title || null,
    p_start_at: values.start_at,
    p_end_at: values.end_at,
    p_all_day: values.all_day,
  })
  if (error) throw error
  return data
}

export async function deleteException(tenantId: string, exceptionId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('booking_delete_exception', {
    p_tenant: tenantId,
    p_exception: exceptionId,
  })
  if (error) throw error
}

export async function updatePageSettings(
  tenantId: string,
  pageId: string,
  values: PageSettingsFormValues,
): Promise<void> {
  const { error } = await requireSupabase().rpc('booking_update_page_settings', {
    p_tenant: tenantId,
    p_booking_page: pageId,
    p_title: values.title,
    p_description: values.description || null,
    p_primary_color: values.primary_color || null,
    p_logo_url: values.logo_url || null,
    p_lead_time_minutes: values.lead_time_minutes,
    p_booking_horizon_days: values.booking_horizon_days,
    p_slot_interval_minutes: values.slot_interval_minutes,
    p_require_email: values.require_email,
    p_require_phone: values.require_phone,
    p_allow_cancellation: values.allow_cancellation,
    p_allow_rescheduling: values.allow_rescheduling,
    p_cancellation_hours: values.cancellation_hours,
    p_active: values.active,
    p_service_ids: values.service_ids,
  })
  if (error) throw error
}

export type StaffAppointmentInput = {
  service_id: string
  customer_name: string
  start_at: string
  resource_id: string
  contact_id: string
  customer_phone: string
  customer_email: string
  notes: string
  idempotency_key: string
}

/** The server recomputes `end_at` and validates `start_at` against live slots. */
export async function createStaffAppointment(tenantId: string, values: StaffAppointmentInput): Promise<string> {
  const { data, error } = await requireSupabase().rpc('booking_create_staff', {
    p_tenant: tenantId,
    p_service_id: values.service_id,
    p_customer_name: values.customer_name,
    p_start_at: values.start_at,
    p_resource_id: values.resource_id || null,
    p_contact_id: values.contact_id || null,
    p_customer_phone: values.customer_phone || null,
    p_customer_email: values.customer_email || null,
    p_notes: values.notes || null,
    p_idempotency_key: values.idempotency_key,
  })
  if (error) throw error
  void syncAppointmentToCalendar({ tenantId, appointmentId: data })
  return data
}

export async function setAppointmentStatus(
  tenantId: string,
  appointmentId: string,
  status: AppointmentStatus,
  reason?: string,
): Promise<void> {
  const { error } = await requireSupabase().rpc('booking_set_status', {
    p_tenant: tenantId,
    p_appointment: appointmentId,
    p_status: status,
    p_reason: reason ?? null,
  })
  if (error) throw error
  void syncAppointmentToCalendar({ tenantId, appointmentId })
}

export async function rescheduleAppointment(
  tenantId: string,
  appointmentId: string,
  startAt: string,
  reason?: string,
): Promise<void> {
  const { error } = await requireSupabase().rpc('booking_reschedule', {
    p_tenant: tenantId,
    p_appointment: appointmentId,
    p_start_at: startAt,
    p_reason: reason ?? null,
  })
  if (error) throw error
  void syncAppointmentToCalendar({ tenantId, appointmentId })
}

export async function assignAppointment(
  tenantId: string,
  appointmentId: string,
  resourceId: string,
  userId: string | null,
): Promise<void> {
  const { error } = await requireSupabase().rpc('booking_assign', {
    p_tenant: tenantId,
    p_appointment: appointmentId,
    p_resource_id: resourceId,
    p_user_id: userId,
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Calendar connection runtime (Supabase RPCs, no provider calls here).
// ---------------------------------------------------------------------------

const calendarConnectionStatusSchema = z.object({
  connected: z.boolean(),
  provider: z.string(),
  google_email: z.string().nullable(),
  calendar_id: z.string().nullable(),
  status: z.string(),
  sync_enabled: z.boolean(),
  last_synced_at: z.string().nullable(),
  last_error: z.string().nullable(),
  updated_at: z.string().nullable(),
})

const calendarConnectionStatusListSchema = z.array(calendarConnectionStatusSchema)

export type CalendarConnectionStatus = z.infer<typeof calendarConnectionStatusSchema>

export async function fetchCalendarConnectionStatus(tenantId: string): Promise<CalendarConnectionStatus | null> {
  const { data, error } = await requireSupabase().rpc('calendar_connection_status' as never, {
    p_tenant: tenantId, p_provider: 'google',
  } as never)
  if (error) throw error
  return calendarConnectionStatusListSchema.parse(data ?? [])[0] ?? null
}

export async function disconnectCalendarConnection(tenantId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('calendar_connection_disconnect' as never, {
    p_tenant: tenantId, p_provider: 'google',
  } as never)
  if (error) throw error
}

const oauthStartSchema = z.object({
  url: z.string().url().refine((value) => {
    try {
      const protocol = new URL(value).protocol
      return protocol === 'http:' || protocol === 'https:'
    } catch {
      return false
    }
  }, 'OAuth URL must be http(s)'),
})

export async function startGoogleCalendarOAuth(tenantId: string): Promise<string> {
  const { data, error } = await requireSupabase().functions.invoke('calendar-oauth-start', {
    body: { tenant_id: tenantId },
  })
  if (error) throw error
  return oauthStartSchema.parse(data).url
}

// ---------------------------------------------------------------------------
// Calendar sync (Phase 2 v1, best-effort). Failures should not break booking.
// ---------------------------------------------------------------------------

export async function syncAppointmentToCalendar(input: {
  tenantId?: string
  appointmentId: string
  manageToken?: string
}): Promise<void> {
  try {
    const { error } = await requireSupabase().functions.invoke('calendar-sync-appointment', {
      body: {
        tenant_id: input.tenantId,
        appointment_id: input.appointmentId,
        manage_token: input.manageToken,
      },
    })
    if (error) console.warn('Calendar sync failed', error.message)
  } catch (e) {
    console.warn('Calendar sync failed', e)
  }
}

// ---------------------------------------------------------------------------
// Anonymous, slug/token-scoped public booking RPCs
// ---------------------------------------------------------------------------

export async function fetchPublicBookingPage(slug: string): Promise<PublicBookingPage | null> {
  const { data, error } = await requireSupabase().rpc('public_booking_get_page', { p_slug: slug })
  if (error) throw error
  if (!data || typeof data.slug !== 'string' || !data.slug) return null
  return { ...data, services: Array.isArray(data.services) ? data.services : [] }
}

export async function fetchPublicSlots(slug: string, serviceId: string, date: string): Promise<BookingSlot[]> {
  const { data, error } = await requireSupabase().rpc('public_booking_get_slots', {
    p_slug: slug,
    p_service_id: serviceId,
    p_date: date,
    p_resource_id: null,
  })
  if (error) throw error
  return data ?? []
}

export type PublicBookingInput = {
  slug: string
  service_id: string
  start_at: string
  customer_name: string
  customer_phone: string
  customer_email: string
  notes: string
  idempotency_key: string
}

export async function createPublicBooking(values: PublicBookingInput): Promise<PublicBookingResult> {
  const { data, error } = await requireSupabase().rpc('public_booking_create', {
    p_slug: values.slug,
    p_service_id: values.service_id,
    p_start_at: values.start_at,
    p_customer_name: values.customer_name,
    p_customer_phone: values.customer_phone,
    p_customer_email: values.customer_email || null,
    p_notes: values.notes || null,
    p_idempotency_key: values.idempotency_key,
  })
  if (error) throw error
  void syncAppointmentToCalendar({ appointmentId: data.id, manageToken: data.manage_token })
  return data
}

export async function managePublicBooking(input: {
  token: string
  action: 'cancel' | 'reschedule'
  startAt?: string | null
  reason?: string
}): Promise<PublicBookingManageResult> {
  const { data, error } = await requireSupabase().rpc('public_booking_manage', {
    p_token: input.token,
    p_action: input.action,
    p_start_at: input.startAt ?? null,
    p_reason: input.reason ?? null,
  })
  if (error) throw error
  void syncAppointmentToCalendar({ appointmentId: data.id, manageToken: input.token })
  return data
}
