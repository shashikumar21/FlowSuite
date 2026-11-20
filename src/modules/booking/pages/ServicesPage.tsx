import { useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Scissors } from 'lucide-react'
import { getErrorMessage } from '@/lib/errors'
import type { ServiceRow } from '@/types/database'
import { setServiceActive } from '../api'
import { ServiceFormModal } from '../components/ServiceFormModal'
import { useBookingInvalidate, useBookingOptions } from '../hooks'
import { formatPrice, linkedResourceIds } from '../utils'

export function ServicesPage() {
  const { user } = useAuth()
  const { activeTenant, can } = useTenant()
  const { toast } = useToast()
  const tenantId = activeTenant?.tenant_id
  const canManageConfig = can('manage_booking_config')
  const invalidate = useBookingInvalidate(tenantId)

  const optionsQuery = useBookingOptions(tenantId)
  const services = optionsQuery.data?.services ?? []
  const resources = optionsQuery.data?.resources ?? []
  const serviceResources = optionsQuery.data?.serviceResources ?? []

  const [editing, setEditing] = useState<ServiceRow | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [workingId, setWorkingId] = useState<string | null>(null)

  const toggleActive = async (service: ServiceRow) => {
    if (!tenantId || workingId) return
    setWorkingId(service.id)
    try {
      await setServiceActive(tenantId, service.id, !service.active)
      toast({ title: service.active ? 'Service hidden from booking' : 'Service is bookable again' })
      invalidate()
    } catch (error) {
      toast({ title: 'Could not update service', description: getErrorMessage(error), variant: 'error' })
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Booking setup</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Services</h1>
          <p className="mt-1 text-sm text-ink-500">
            Define what customers can book. Configuration changes are attributed to {user?.email ?? 'your team'}.
          </p>
        </div>
        {canManageConfig ? (
          <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
            <Scissors className="size-4" /> New service
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="px-0 py-0">
          {optionsQuery.isLoading ? (
            <div className="space-y-3 p-5">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-12" />)}</div>
          ) : optionsQuery.isError ? (
            <ErrorState message="We couldn't load services for this business." onRetry={() => { void optionsQuery.refetch() }} />
          ) : services.length === 0 ? (
            <EmptyState
              icon={<Scissors className="size-5" />}
              title="No services yet"
              description="Add a service with a duration and price before enabling online booking."
              action={canManageConfig ? (
                <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true) }}>Add service</Button>
              ) : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Service</th>
                    <th className="px-3 py-3 font-semibold">Duration</th>
                    <th className="px-3 py-3 font-semibold">Price</th>
                    <th className="px-3 py-3 font-semibold">Buffers</th>
                    <th className="px-3 py-3 font-semibold">Resources</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    {canManageConfig ? <th className="px-5 py-3 font-semibold">Actions</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {services.map((service) => (
                    <tr key={service.id} className="align-top">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-ink-900">{service.name}</p>
                        <p className="max-w-xs truncate text-xs text-ink-500">{service.description ?? '—'}</p>
                      </td>
                      <td className="px-3 py-3 text-ink-700">{service.duration_minutes} min</td>
                      <td className="px-3 py-3 text-ink-700">{formatPrice(service.price, service.currency)}</td>
                      <td className="px-3 py-3 text-xs text-ink-600">
                        {service.buffer_before_minutes}m before · {service.buffer_after_minutes}m after
                      </td>
                      <td className="px-3 py-3 text-ink-600">
                        {linkedResourceIds(serviceResources, service.id).length || 'Any'}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={service.active ? 'success' : 'neutral'}>
                          {service.active ? 'Active' : 'Hidden'}
                        </Badge>
                      </td>
                      {canManageConfig ? (
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={workingId === service.id}
                              onClick={() => { setEditing(service); setFormOpen(true) }}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              loading={workingId === service.id}
                              onClick={() => { void toggleActive(service) }}
                            >
                              {service.active ? 'Deactivate' : 'Activate'}
                            </Button>
                          </div>
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

      <ServiceFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        tenantId={tenantId ?? ''}
        service={editing}
        resources={resources}
        linkedResourceIds={editing ? linkedResourceIds(serviceResources, editing.id) : []}
        onSaved={invalidate}
      />
    </div>
  )
}
