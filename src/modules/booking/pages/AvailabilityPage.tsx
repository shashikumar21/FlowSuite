import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/app/providers/AuthProvider'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { FieldError, Label, Select } from '@/components/ui/Input'
import { CalendarRange, Clock3 } from 'lucide-react'
import { getErrorMessage } from '@/lib/errors'
import type { AvailabilityRuleRow, BookingResourceRow } from '@/types/database'
import { deleteException, fetchSlots } from '../api'
import { AvailabilityExceptionFormModal } from '../components/AvailabilityExceptionFormModal'
import { AvailabilityRuleFormModal } from '../components/AvailabilityRuleFormModal'
import { SlotPicker } from '../components/SlotPicker'
import {
  bookingKeys,
  useBookingAvailability,
  useBookingInvalidate,
  useBookingOptions,
  useBookingPageSettings,
} from '../hooks'
import { weekDays } from '../schemas'
import {
  bookingDateOptions,
  DEFAULT_BUSINESS_TIMEZONE,
  formatLeadTime,
  formatSlotDateTime,
  todayInZone,
} from '../utils'

export function AvailabilityPage() {
  const { user } = useAuth()
  const { activeTenant, can } = useTenant()
  const { toast } = useToast()
  const tenantId = activeTenant?.tenant_id
  const timeZone = activeTenant?.businesses?.timezone ?? DEFAULT_BUSINESS_TIMEZONE
  const canManageConfig = can('manage_booking_config')
  const invalidate = useBookingInvalidate(tenantId)

  const availabilityQuery = useBookingAvailability(tenantId)
  const optionsQuery = useBookingOptions(tenantId)
  const pageQuery = useBookingPageSettings(tenantId)

  const rules = availabilityQuery.data?.rules ?? []
  const exceptions = availabilityQuery.data?.exceptions ?? []
  const services = optionsQuery.data?.services ?? []
  const resources: BookingResourceRow[] = optionsQuery.data?.resources ?? []
  const activeServices = services.filter((service) => service.active)
  const slotInterval = pageQuery.data?.page?.slot_interval_minutes ?? 15
  const leadTime = pageQuery.data?.page?.lead_time_minutes ?? 60

  const [ruleOpen, setRuleOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<AvailabilityRuleRow | null>(null)
  const [exceptionOpen, setExceptionOpen] = useState(false)
  const [previewServiceId, setPreviewServiceId] = useState('')
  const [previewDate, setPreviewDate] = useState(() => todayInZone(timeZone))
  const [previewResourceId, setPreviewResourceId] = useState('')
  const [workingId, setWorkingId] = useState<string | null>(null)

  const dates = bookingDateOptions(timeZone, pageQuery.data?.page?.booking_horizon_days ?? 60)
  const effectiveServiceId = previewServiceId || activeServices[0]?.id || ''
  const effectiveDate = dates.includes(previewDate) ? previewDate : dates[0] ?? ''

  const slotsQuery = useQuery({
    queryKey: [...bookingKeys.slots(tenantId ?? ''), 'preview', effectiveServiceId, effectiveDate, previewResourceId],
    enabled: Boolean(tenantId && effectiveServiceId && effectiveDate),
    queryFn: () =>
      fetchSlots(tenantId as string, effectiveServiceId, effectiveDate, previewResourceId || null, {
        intervalMinutes: slotInterval,
        leadTimeMinutes: leadTime,
      }),
  })

  const resourceName = (resourceId: string | null) =>
    resourceId ? resources.find((resource) => resource.id === resourceId)?.name ?? 'Resource' : 'All resources'

  const handleDeleteException = async (exceptionId: string) => {
    if (!tenantId || workingId) return
    setWorkingId(exceptionId)
    try {
      await deleteException(tenantId, exceptionId)
      toast({ title: 'Exception removed' })
      invalidate()
    } catch (error) {
      toast({ title: 'Could not remove exception', description: getErrorMessage(error), variant: 'error' })
    } finally {
      setWorkingId(null)
    }
  }

  const isLoading = availabilityQuery.isLoading || optionsQuery.isLoading || pageQuery.isLoading
  const isError = availabilityQuery.isError || optionsQuery.isError || pageQuery.isError

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Booking setup</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Availability</h1>
          <p className="mt-1 text-sm text-ink-500">
            Weekly hours and exceptions are interpreted in {timeZone}. Saved by {user?.email ?? 'your team'}.
          </p>
        </div>
        {canManageConfig ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { setEditingRule(null); setRuleOpen(true) }}>
              <Clock3 className="size-4" /> Add weekly rule
            </Button>
            <Button onClick={() => setExceptionOpen(true)}>
              <CalendarRange className="size-4" /> Add exception
            </Button>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Card><CardContent className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-10" /></CardContent></Card>
          <Card><CardContent className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-10" /></CardContent></Card>
        </div>
      ) : isError ? (
        <Card>
          <ErrorState
            message="We couldn't load availability settings."
            onRetry={() => {
              void availabilityQuery.refetch()
              void optionsQuery.refetch()
              void pageQuery.refetch()
            }}
          />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Weekly rules</CardTitle>
              <CardDescription>Day numbers follow PostgreSQL: 0 = Sunday through 6 = Saturday.</CardDescription>
            </CardHeader>
            <CardContent className="px-0 py-0">
              {rules.length === 0 ? (
                <EmptyState
                  icon={<Clock3 className="size-5" />}
                  title="No weekly hours configured"
                  description="Add a rule to open a time window for bookings."
                  action={canManageConfig ? (
                    <Button size="sm" onClick={() => { setEditingRule(null); setRuleOpen(true) }}>Add weekly rule</Button>
                  ) : undefined}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Day</th>
                        <th className="px-3 py-3 font-semibold">Hours</th>
                        <th className="px-3 py-3 font-semibold">Resource</th>
                        <th className="px-3 py-3 font-semibold">Validity</th>
                        <th className="px-3 py-3 font-semibold">Status</th>
                        {canManageConfig ? <th className="px-5 py-3 font-semibold">Actions</th> : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {[...rules]
                        .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time))
                        .map((rule) => (
                          <tr key={rule.id}>
                            <td className="px-5 py-3 font-semibold text-ink-900">
                              {weekDays.find((day) => day.value === rule.day_of_week)?.label ?? rule.day_of_week}
                            </td>
                            <td className="px-3 py-3 text-ink-700">{rule.start_time.slice(0, 5)} – {rule.end_time.slice(0, 5)}</td>
                            <td className="px-3 py-3 text-ink-600">{resourceName(rule.resource_id)}</td>
                            <td className="px-3 py-3 text-xs text-ink-500">
                              {rule.valid_from ?? 'Any'} → {rule.valid_until ?? 'Any'}
                            </td>
                            <td className="px-3 py-3">
                              <Badge variant={rule.is_active ? 'success' : 'neutral'}>
                                {rule.is_active ? 'Active' : 'Paused'}
                              </Badge>
                            </td>
                            {canManageConfig ? (
                              <td className="px-5 py-3">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => { setEditingRule(rule); setRuleOpen(true) }}
                                >
                                  Edit
                                </Button>
                              </td>
                            ) : null}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Exceptions</CardTitle>
              <CardDescription>Blocked, extra-available and break windows override weekly rules.</CardDescription>
            </CardHeader>
            <CardContent className="px-0 py-0">
              {exceptions.length === 0 ? (
                <EmptyState
                  icon={<CalendarRange className="size-5" />}
                  title="No exceptions"
                  description="Block holidays or open special hours for a date range."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Title</th>
                        <th className="px-3 py-3 font-semibold">Type</th>
                        <th className="px-3 py-3 font-semibold">When</th>
                        <th className="px-3 py-3 font-semibold">Resource</th>
                        {canManageConfig ? <th className="px-5 py-3 font-semibold">Actions</th> : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {exceptions.map((exception) => (
                        <tr key={exception.id}>
                          <td className="px-5 py-3 font-semibold text-ink-900">
                            {exception.title ?? 'Exception'}
                            {exception.all_day ? <Badge className="ml-2" variant="brand">All day</Badge> : null}
                          </td>
                          <td className="px-3 py-3"><Badge variant="warning">{exception.exception_type}</Badge></td>
                          <td className="px-3 py-3 text-ink-700">
                            {formatSlotDateTime(exception.start_at, timeZone)} → {formatSlotDateTime(exception.end_at, timeZone)}
                          </td>
                          <td className="px-3 py-3 text-ink-600">{resourceName(exception.resource_id)}</td>
                          {canManageConfig ? (
                            <td className="px-5 py-3">
                              <Button
                                size="sm"
                                variant="danger"
                                loading={workingId === exception.id}
                                onClick={() => { void handleDeleteException(exception.id) }}
                              >
                                Delete
                              </Button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Live slot preview</CardTitle>
              <CardDescription>
                Computed by the server from rules, exceptions and existing appointments · {formatLeadTime(leadTime)}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="preview-service">Service</Label>
                  <Select id="preview-service" value={effectiveServiceId} onChange={(event) => setPreviewServiceId(event.target.value)}>
                    <option value="">Select a service</option>
                    {activeServices.map((service) => (
                      <option key={service.id} value={service.id}>{service.name}</option>
                    ))}
                  </Select>
                  <FieldError>{!effectiveServiceId ? 'Choose a service to preview slots.' : undefined}</FieldError>
                </div>
                <div>
                  <Label htmlFor="preview-date">Date ({timeZone})</Label>
                  <Select id="preview-date" value={effectiveDate} onChange={(event) => setPreviewDate(event.target.value)}>
                    {dates.map((option) => <option key={option} value={option}>{option}</option>)}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="preview-resource">Resource (optional)</Label>
                  <Select id="preview-resource" value={previewResourceId} onChange={(event) => setPreviewResourceId(event.target.value)}>
                    <option value="">Auto-assign</option>
                    {resources.map((resource) => (
                      <option key={resource.id} value={resource.id}>{resource.name}</option>
                    ))}
                  </Select>
                </div>
              </div>
              {slotsQuery.isError ? (
                <p className="text-sm text-red-600">{getErrorMessage(slotsQuery.error)}</p>
              ) : (
                <SlotPicker
                  slots={slotsQuery.data ?? []}
                  timeZone={timeZone}
                  loading={slotsQuery.isLoading}
                  onSelect={() => undefined}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}

      <AvailabilityRuleFormModal
        open={ruleOpen}
        onClose={() => setRuleOpen(false)}
        tenantId={tenantId ?? ''}
        rule={editingRule}
        resources={resources}
        onSaved={invalidate}
      />
      <AvailabilityExceptionFormModal
        open={exceptionOpen}
        onClose={() => setExceptionOpen(false)}
        tenantId={tenantId ?? ''}
        resources={resources}
        onSaved={invalidate}
      />
    </div>
  )
}
