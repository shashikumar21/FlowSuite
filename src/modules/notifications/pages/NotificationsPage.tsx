import { useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { getErrorMessage } from '@/lib/errors'
import { markAllNotificationsRead, markNotificationRead, NOTIFICATION_PAGE_SIZE } from '../api'
import { NotificationItem } from '../components/NotificationItem'
import {
  useNotificationInvalidate,
  useNotificationUnreadCount,
  useNotifications,
  type NotificationFilter,
} from '../hooks'
import { formatUnreadCount } from '../utils'

export function NotificationsPage() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const { toast } = useToast()
  const invalidate = useNotificationInvalidate(tenantId)

  const [filter, setFilter] = useState<NotificationFilter>('all')
  const [page, setPage] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)

  const unreadQuery = useNotificationUnreadCount(tenantId)
  const listQuery = useNotifications(tenantId, filter, page)

  const unreadCount = Math.max(0, unreadQuery.data ?? 0)
  const unreadBadge = formatUnreadCount(unreadCount)
  const items = listQuery.data?.items ?? []
  const total = listQuery.data?.totalCount ?? 0
  const loading = listQuery.isLoading || unreadQuery.isLoading
  const failed = listQuery.isError || unreadQuery.isError

  const changeFilter = (next: NotificationFilter) => {
    setFilter(next)
    setPage(0)
  }

  /** A read-state change shrinks the unread list, so return to its first page. */
  const afterWrite = () => {
    invalidate()
    if (filter === 'unread' && page > 0) setPage(0)
  }

  const handleMarkOne = async (id: string) => {
    if (!tenantId || busyId) return
    setBusyId(id)
    try {
      await markNotificationRead(tenantId, id)
      toast({ title: 'Marked as read' })
      afterWrite()
    } catch (cause) {
      toast({
        title: 'Could not mark as read',
        description: getErrorMessage(cause),
        variant: 'error',
      })
    } finally {
      setBusyId(null)
    }
  }

  const handleMarkAll = async () => {
    if (!tenantId || markingAll || unreadCount === 0) return
    setMarkingAll(true)
    try {
      await markAllNotificationsRead(tenantId)
      toast({ title: 'All notifications marked as read' })
      afterWrite()
    } catch (cause) {
      toast({
        title: 'Could not update notifications',
        description: getErrorMessage(cause),
        variant: 'error',
      })
    } finally {
      setMarkingAll(false)
    }
  }

  const firstItem = page * NOTIFICATION_PAGE_SIZE + 1
  const lastItem = firstItem + items.length - 1

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Workspace</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Notifications</h1>
          <p className="mt-1 text-sm text-ink-500">
            Appointment and inbox updates addressed to you in this business.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadBadge ? <Badge variant="brand">{unreadBadge} unread</Badge> : null}
          <Button
            variant="outline"
            disabled={markingAll || unreadCount === 0 || loading || failed}
            onClick={() => { void handleMarkAll() }}
          >
            <CheckCheck className="size-4" />
            {markingAll ? 'Saving…' : 'Mark all as read'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={filter === 'all' ? 'primary' : 'ghost'}
              aria-pressed={filter === 'all'}
              onClick={() => changeFilter('all')}
            >
              All
            </Button>
            <Button
              size="sm"
              variant={filter === 'unread' ? 'primary' : 'ghost'}
              aria-pressed={filter === 'unread'}
              onClick={() => changeFilter('unread')}
            >
              Unread{unreadBadge ? ` (${unreadBadge})` : ''}
            </Button>
          </div>
          <p className="text-xs text-ink-500">
            {total} notification{total === 1 ? '' : 's'}
          </p>
        </CardHeader>

        <CardContent className="px-0 py-0">
          {loading ? (
            <div className="space-y-3 p-5">{[0, 1, 2, 3, 4].map((index) => <Skeleton key={index} className="h-14" />)}</div>
          ) : failed ? (
            <ErrorState
              message="We couldn't load notifications for this business."
              onRetry={() => { void listQuery.refetch(); void unreadQuery.refetch() }}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Bell className="size-5" />}
              title={filter === 'unread' ? 'No unread notifications' : "You're all caught up."}
              description={
                filter === 'unread'
                  ? 'Switch to All to see earlier updates.'
                  : 'Appointment and inbox updates will appear here.'
              }
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {items.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  busy={busyId === notification.id}
                  onMarkRead={(id) => { void handleMarkOne(id) }}
                />
              ))}
            </ul>
          )}
        </CardContent>

        {items.length > 0 ? (
          <CardFooter className="justify-between text-xs text-ink-500">
            <span>
              {firstItem}–{lastItem} of {total}
            </span>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={(page + 1) * NOTIFICATION_PAGE_SIZE >= total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </CardFooter>
        ) : null}
      </Card>
    </div>
  )
}
