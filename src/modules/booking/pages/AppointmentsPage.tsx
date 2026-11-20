import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, Plus, RotateCcw, UserRoundCheck } from 'lucide-react'
import { useAuth } from '@/app/providers/AuthProvider'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { FieldError, Input, Label, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { AppointmentRow, AppointmentStatus } from '@/types/database'
import { assignAppointment, setAppointmentStatus } from '../api'
import { AppointmentFormModal } from '../components/AppointmentFormModal'
import { RescheduleModal } from '../components/RescheduleModal'
import { AppointmentStatusBadge } from '../components/StatusBadge'
import { useBookingAppointments, useBookingInvalidate, useBookingOptions, useBookingPageSettings } from '../hooks'
import { appointmentStatuses } from '../schemas'
import {
  allowedStatusTransitions,
  appointmentStatusLabel,
  DEFAULT_BUSINESS_TIMEZONE,
  formatSlotDateTime,
  sortAppointments,
} from '../utils'

export function AppointmentsPage() {
  const { user } = useAuth()
  const { activeTenant, can } = useTenant()
  const { toast } = useToast()
  const tenantId = activeTenant?.tenant_id
  const timeZone = activeTenant?.businesses?.timezone ?? DEFAULT_BUSINESS_TIMEZONE
  const canManage = can('manage_appointments')
  const invalidate = useBookingInvalidate(tenantId)

  const [searchParams, setSearchParams] = useSearchParams()
  const [status, setStatus] = useState('')
  const [date, setDate] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [rescheduling, setRescheduling] = useState<AppointmentRow | null>(null)
  const [assigning, setAssigning] = useState<AppointmentRow | null>(null)
  const [assignResourceId, setAssignResourceId] = useState('')
  const [assignUserId, setAssignUserId] = useState('')
  const [workingId, setWorkingId] = useState<string | null>(null)

  // Deep link from the overview: the URL is the source of truth for opening the modal.
  useEffect(() => {
    if (searchParams.get('new') !== '1' || !canManage) return
    // oxlint-disable-next-line react/set-state-in-effect
    setFormOpen(true)
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, canManage])

  const appointmentsQuery = useBookingAppointments(tenantId, {
    status: (status || undefined) as AppointmentStatus | undefined,
    date,
    timeZone,
    limit: 300,
  })
  const optionsQuery = useBookingOptions(tenantId)
  const pageQuery = useBookingPageSettings(tenantId)

  const options = optionsQuery.data
  const services = options?.services ?? []
  const resources = options?.resources ?? []
  const members = options?.members ?? []
  const serviceResources = options?.serviceResources ?? []
  const serviceName = (appointment: AppointmentRow) =>
    services.find((service) => service.id === appointment.service_id)?.name ?? appointment.title
  const resourceName = (appointment: AppointmentRow) =>
    resources.find((resource) => resource.id === appointment.resource_id)?.name ?? 'Auto-assigned'
  const rows = sortAppointments(appointmentsQuery.data ?? [])

  const handleStatusChange = async (appointment: AppointmentRow, next: AppointmentStatus) => {
    if (!tenantId || workingId) return
    setWorkingId(appointment.id)
    try {
      await setAppointmentStatus(tenantId, appointment.id, next)
      toast({ title: `Appointment ${appointmentStatusLabel(next).toLowerCase()}` })
      invalidate()
    } catch (error) {
      toast({ title: 'Status change failed', description: getErrorMessage(error), variant: 'error' })
    } finally {
      setWorkingId(null)
    }
  }

  const handleAssign = async () => {
    if (!tenantId || !assigning || workingId) return
    setWorkingId(assigning.id)
    try {
      await assignAppointment(tenantId, assigning.id, assignResourceId, assignUserId || null)
      toast({ title: 'Appointment assigned' })
      setAssigning(null)
      invalidate()
    } catch (error) {
      toast({ title: 'Assignment failed', description: getErrorMessage(error), variant: 'error' })
    } finally {
      setWorkingId(null)
    }
  }

  const clearFilters = () => {
    setStatus('')
    setDate('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Booking</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Appointments</h1>
          <p className="mt-1 text-sm text-ink-500">
            Staff-created and online bookings · times shown in {timeZone}. Cancelled appointments stay in history.
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setFormOpen(true)}><Plus className="size-4" /> New appointment</Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="appointment-status-filter">Status</Label>
            <Select id="appointment-status-filter" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              {appointmentStatuses.map((item) => <option key={item} value={item}>{appointmentStatusLabel(item)}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="appointment-date-filter">Date ({timeZone})</Label>
            <Input id="appointment-date-filter" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          {status || date ? (
            <div className="flex items-end">
              <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
                <RotateCcw className="size-4" /> Clear filters
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-0 py-0">
          {appointmentsQuery.isLoading || optionsQuery.isLoading || pageQuery.isLoading ? (
            <div className="space-y-3 p-5">{[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-12" />)}</div>
          ) : appointmentsQuery.isError || optionsQuery.isError || pageQuery.isError ? (
            <ErrorState
              message="We couldn't load appointments for this business."
              onRetry={() => {
                void appointmentsQuery.refetch()
                void optionsQuery.refetch()
                void pageQuery.refetch()
              }}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="size-5" />}
              title={status || date ? 'No matching appointments' : 'No appointments yet'}
              description={status || date ? 'Try changing the status or date filter.' : 'Create an appointment or share your booking page link.'}
              action={canManage && !status && !date ? (
                <Button size="sm" onClick={() => setFormOpen(true)}>New appointment</Button>
              ) : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Customer</th>
                    <th className="px-3 py-3 font-semibold">Service</th>
                    <th className="px-3 py-3 font-semibold">Resource</th>
                    <th className="px-3 py-3 font-semibold">When</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    {canManage ? <th className="px-5 py-3 font-semibold">Actions</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {rows.map((appointment) => {
                    const transitions = allowedStatusTransitions(appointment.status)
                    return (
                      <tr key={appointment.id} className="align-top">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-ink-900">{appointment.customer_name ?? 'Customer'}</p>
                          <p className="text-xs text-ink-500">
                            {appointment.customer_email ?? appointment.customer_phone ?? appointment.booking_source}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-ink-700">{serviceName(appointment)}</td>
                        <td className="px-3 py-3 text-ink-600">{resourceName(appointment)}</td>
                        <td className="px-3 py-3 text-ink-700">
                          {formatSlotDateTime(appointment.start_at, timeZone)}
                          {appointment.rescheduled_from ? <Badge className="ml-2" variant="brand">Rescheduled</Badge> : null}
                        </td>
                        <td className="px-3 py-3"><AppointmentStatusBadge status={appointment.status} /></td>
                        {canManage ? (
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              {transitions.length > 0 ? (
                                <Select
                                  aria-label={`Change status for ${appointment.customer_name ?? 'appointment'}`}
                                  className="h-8 w-auto text-xs"
                                  value=""
                                  disabled={workingId === appointment.id}
                                  onChange={(event) => {
                                    const next = event.target.value as AppointmentStatus
                                    if (next) void handleStatusChange(appointment, next)
                                  }}
                                >
                                  <option value="">Change status…</option>
                                  {transitions.map((next) => (
                                    <option key={next} value={next}>{appointmentStatusLabel(next)}</option>
                                  ))}
                                </Select>
                              ) : null}
                              {appointment.status !== 'cancelled' && appointment.status !== 'completed' && appointment.status !== 'no_show' ? (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setRescheduling(appointment)}
                                  >
                                    <RotateCcw className="size-4" /> Reschedule
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setAssigning(appointment)
                                      setAssignResourceId(appointment.resource_id ?? '')
                                      setAssignUserId(
                                        user?.id && members.some((member) => member.user_id === user.id)
                                          ? user.id
                                          : '',
                                      )
                                    }}
                                  >
                                    <UserRoundCheck className="size-4" /> Assign
                                  </Button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AppointmentFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        tenantId={tenantId ?? ''}
        timeZone={timeZone}
        services={services}
        resources={resources}
        serviceResources={serviceResources}
        horizonDays={pageQuery.data?.page?.booking_horizon_days}
        slotIntervalMinutes={pageQuery.data?.page?.slot_interval_minutes}
        leadTimeMinutes={pageQuery.data?.page?.lead_time_minutes}
        onSaved={invalidate}
      />

      <RescheduleModal
        open={rescheduling !== null}
        onClose={() => setRescheduling(null)}
        tenantId={tenantId ?? ''}
        appointment={rescheduling}
        timeZone={timeZone}
        serviceName={rescheduling ? serviceName(rescheduling) : null}
        horizonDays={pageQuery.data?.page?.booking_horizon_days}
        slotIntervalMinutes={pageQuery.data?.page?.slot_interval_minutes}
        leadTimeMinutes={pageQuery.data?.page?.lead_time_minutes}
        onSaved={invalidate}
      />

      <Modal
        open={assigning !== null}
        onClose={() => setAssigning(null)}
        title="Assign appointment"
        description="Assign a bookable resource and, optionally, a team member."
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="assign-resource">Resource</Label>
            <Select id="assign-resource" value={assignResourceId} onChange={(event) => setAssignResourceId(event.target.value)}>
              <option value="">Select a resource</option>
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>{resource.name} ({resource.kind})</option>
              ))}
            </Select>
            <FieldError>{!assignResourceId ? 'A resource is required.' : undefined}</FieldError>
          </div>
          <div>
            <Label htmlFor="assign-member">Team member (optional)</Label>
            <Select id="assign-member" value={assignUserId} onChange={(event) => setAssignUserId(event.target.value)}>
              <option value="">No member selected</option>
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.full_name ?? member.user_id} ({member.role})
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAssigning(null)}>Cancel</Button>
            <Button type="button" disabled={!assignResourceId} loading={workingId === assigning?.id} onClick={() => { void handleAssign() }}>
              Save assignment
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
