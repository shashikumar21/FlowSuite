import { Link } from 'react-router-dom'
import { CalendarDays, CheckCircle2, Clock3, Copy, ExternalLink, Plus, Users } from 'lucide-react'
import { useAuth } from '@/app/providers/AuthProvider'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { copyText } from '@/lib/clipboard'
import { AppointmentStatusBadge } from '../components/StatusBadge'
import { useBookingAppointments, useBookingMetrics, useBookingOptions, useBookingPageSettings } from '../hooks'
import {
  DEFAULT_BUSINESS_TIMEZONE,
  formatPrice,
  formatSlotDateTime,
  isOpenAppointment,
  sortAppointments,
} from '../utils'
import type { AppointmentRow, ServiceRow } from '@/types/database'

export function BookingOverviewPage() {
  const { user } = useAuth()
  const { activeTenant, can } = useTenant()
  const { toast } = useToast()
  const tenantId = activeTenant?.tenant_id
  const timeZone = activeTenant?.businesses?.timezone ?? DEFAULT_BUSINESS_TIMEZONE
  const canManageAppointments = can('manage_appointments')

  const metricsQuery = useBookingMetrics(tenantId)
  const appointmentsQuery = useBookingAppointments(tenantId, { upcomingOnly: true, timeZone, limit: 12 })
  const pageQuery = useBookingPageSettings(tenantId)
  const optionsQuery = useBookingOptions(tenantId)

  const metrics = metricsQuery.data
  const appointments = sortAppointments(
    (appointmentsQuery.data ?? []).filter((appointment) => isOpenAppointment(appointment.status)),
  ).slice(0, 8)
  const services: ServiceRow[] = optionsQuery.data?.services ?? []
  const serviceFor = (appointment: AppointmentRow) =>
    services.find((service) => service.id === appointment.service_id) ?? null
  const serviceName = (appointment: AppointmentRow) =>
    appointment.title || serviceFor(appointment)?.name || 'Appointment'

  const slug = pageQuery.data?.page?.slug ?? activeTenant?.businesses?.slug
  const publicUrl = slug && typeof window !== 'undefined' ? `${window.location.origin}/book/${slug}` : ''

  const copyLink = async () => {
    if (!publicUrl) return
    const copied = await copyText(publicUrl)
    if (copied) toast({ title: 'Booking link copied' })
    else toast({ title: 'Copy this booking link', description: publicUrl, variant: 'info' })
  }

  const cards = [
    { label: 'Today', value: metrics?.today_count, icon: CalendarDays, tone: 'bg-brand-50 text-brand-600' },
    { label: 'Upcoming', value: metrics?.upcoming_count, icon: Clock3, tone: 'bg-blue-50 text-blue-600' },
    { label: 'Awaiting confirmation', value: metrics?.pending_count, icon: Users, tone: 'bg-amber-50 text-amber-600' },
    { label: 'Next 7 days', value: metrics?.week_count, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-600' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Booking</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Booking overview</h1>
          <p className="mt-1 text-sm text-ink-500">
            Today's schedule for {activeTenant?.businesses?.name ?? 'your business'} · times shown in {timeZone}.
            {user?.email ? ` Signed in as ${user.email}.` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManageAppointments ? (
            <Link
              to="/app/appointments?new=1"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
            >
              <Plus className="size-4" /> New appointment
            </Link>
          ) : null}
          <Link
            to="/app/appointments"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-ink-300 bg-white px-4 text-sm font-semibold text-ink-800 hover:bg-ink-50"
          >
            View all appointments
          </Link>
        </div>
      </div>

      {metricsQuery.isLoading || appointmentsQuery.isLoading || pageQuery.isLoading || optionsQuery.isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-24" />)}
          </div>
          <Card><CardContent className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></CardContent></Card>
        </div>
      ) : metricsQuery.isError || appointmentsQuery.isError || pageQuery.isError || optionsQuery.isError ? (
        <Card>
          <ErrorState
            message="We couldn't load booking metrics for this business."
            onRetry={() => {
              void metricsQuery.refetch()
              void appointmentsQuery.refetch()
              void pageQuery.refetch()
              void optionsQuery.refetch()
            }}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => {
              const Icon = card.icon
              return (
                <Card key={card.label}>
                  <CardContent className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{card.label}</p>
                      <p className="mt-1 text-2xl font-bold text-ink-900">{card.value ?? 0}</p>
                    </div>
                    <span className={`flex size-9 items-center justify-center rounded-lg ${card.tone}`}>
                      <Icon className="size-5" />
                    </span>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>Up next</CardTitle>
                  <CardDescription>Confirmed and pending appointments in business time.</CardDescription>
                </div>
                <Badge variant="brand">{appointments.length} shown</Badge>
              </CardHeader>
              <CardContent className="px-0 py-0">
                {appointments.length === 0 ? (
                  <EmptyState
                    icon={<CalendarDays className="size-5" />}
                    title="No upcoming appointments"
                    description="New bookings and staff-created appointments will appear here."
                    action={canManageAppointments ? (
                      <Link to="/app/booking/appointments?new=1" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
                        Book the first appointment
                      </Link>
                    ) : undefined}
                  />
                ) : (
                  <ul className="divide-y divide-ink-100">
                    {appointments.map((appointment) => (
                      <li key={appointment.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink-900">{serviceName(appointment)}</p>
                          <p className="truncate text-xs text-ink-500">
                            {appointment.customer_name ?? 'Customer'} · {formatSlotDateTime(appointment.start_at, timeZone)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <AppointmentStatusBadge status={appointment.status} />
                          {serviceFor(appointment) ? (
                            <span className="text-xs text-ink-500">
                              {formatPrice(serviceFor(appointment)?.price ?? 0, serviceFor(appointment)?.currency)}
                            </span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Online booking page</CardTitle>
                <CardDescription>Share this link with customers.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {publicUrl ? (
                  <>
                    <a
                      href={publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 break-all text-sm font-semibold text-brand-600 hover:text-brand-700"
                    >
                      {publicUrl} <ExternalLink className="size-4 shrink-0" />
                    </a>
                    <Button size="sm" variant="outline" onClick={() => { void copyLink() }}>
                      <Copy className="size-4" /> Copy link
                    </Button>
                    {pageQuery.data?.page?.active === false ? (
                      <p className="text-xs text-amber-700">This booking page is currently inactive.</p>
                    ) : null}
                    {pageQuery.data && !pageQuery.data.onlineBookingsEnabled ? (
                      <p className="text-xs text-amber-700">Online bookings are disabled in business settings.</p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-ink-500">No booking page is configured for this business yet.</p>
                )}
              </CardContent>
              <CardContent className="border-t border-ink-100 pt-3">
                <p className="text-xs text-ink-500">
                  {metrics?.completed_count ?? 0} completed · {metrics?.cancelled_count ?? 0} cancelled · {metrics?.no_show_count ?? 0} no-shows
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
