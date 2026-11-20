import { useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { UsersRound } from 'lucide-react'
import { getErrorMessage } from '@/lib/errors'
import type { BookingResourceRow } from '@/types/database'
import { updateResource } from '../api'
import { ResourceFormModal } from '../components/ResourceFormModal'
import { useBookingInvalidate, useBookingOptions } from '../hooks'

export function ResourcesPage() {
  const { user } = useAuth()
  const { activeTenant, can } = useTenant()
  const { toast } = useToast()
  const tenantId = activeTenant?.tenant_id
  const canManageConfig = can('manage_booking_config')
  const invalidate = useBookingInvalidate(tenantId)

  const optionsQuery = useBookingOptions(tenantId)
  const resources = optionsQuery.data?.resources ?? []
  const members = optionsQuery.data?.members ?? []

  const [editing, setEditing] = useState<BookingResourceRow | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [workingId, setWorkingId] = useState<string | null>(null)

  const toggleActive = async (resource: BookingResourceRow) => {
    if (!tenantId || workingId) return
    setWorkingId(resource.id)
    try {
      await updateResource(tenantId, resource.id, {
        name: resource.name,
        kind: resource.kind,
        member_user_id: resource.member_user_id ?? '',
        notes: resource.notes ?? '',
        active: !resource.active,
      })
      toast({ title: resource.active ? 'Resource deactivated' : 'Resource activated' })
      invalidate()
    } catch (error) {
      toast({ title: 'Could not update resource', description: getErrorMessage(error), variant: 'error' })
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Booking setup</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Resources</h1>
          <p className="mt-1 text-sm text-ink-500">
            Employees, rooms and equipment that can serve appointments. Managed by {user?.email ?? 'your team'}.
          </p>
        </div>
        {canManageConfig ? (
          <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
            <UsersRound className="size-4" /> New resource
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="px-0 py-0">
          {optionsQuery.isLoading ? (
            <div className="space-y-3 p-5">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-12" />)}</div>
          ) : optionsQuery.isError ? (
            <ErrorState message="We couldn't load resources for this business." onRetry={() => { void optionsQuery.refetch() }} />
          ) : resources.length === 0 ? (
            <EmptyState
              icon={<UsersRound className="size-5" />}
              title="No resources yet"
              description="Add a team member, room or equipment so slots can be assigned."
              action={canManageConfig ? (
                <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true) }}>Add resource</Button>
              ) : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Name</th>
                    <th className="px-3 py-3 font-semibold">Kind</th>
                    <th className="px-3 py-3 font-semibold">Team member</th>
                    <th className="px-3 py-3 font-semibold">Notes</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    {canManageConfig ? <th className="px-5 py-3 font-semibold">Actions</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {resources.map((resource) => (
                    <tr key={resource.id} className="align-top">
                      <td className="px-5 py-3 font-semibold text-ink-900">{resource.name}</td>
                      <td className="px-3 py-3"><Badge variant="brand">{resource.kind}</Badge></td>
                      <td className="px-3 py-3 text-ink-600">
                        {members.find((member) => member.user_id === resource.member_user_id)?.full_name ?? '—'}
                      </td>
                      <td className="px-3 py-3 text-xs text-ink-500">{resource.notes ?? '—'}</td>
                      <td className="px-3 py-3">
                        <Badge variant={resource.active ? 'success' : 'neutral'}>
                          {resource.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      {canManageConfig ? (
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={workingId === resource.id}
                              onClick={() => { setEditing(resource); setFormOpen(true) }}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              loading={workingId === resource.id}
                              onClick={() => { void toggleActive(resource) }}
                            >
                              {resource.active ? 'Deactivate' : 'Activate'}
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

      <ResourceFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        tenantId={tenantId ?? ''}
        resource={editing}
        members={members}
        onSaved={invalidate}
      />
    </div>
  )
}
