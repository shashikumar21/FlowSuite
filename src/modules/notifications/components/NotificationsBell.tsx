import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, X } from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { getErrorMessage } from '@/lib/errors'
import { markAllNotificationsRead, markNotificationRead } from '../api'
import { useNotificationInvalidate, useNotificationUnreadCount, useNotifications } from '../hooks'
import { formatUnreadCount } from '../utils'
import { NotificationItem } from './NotificationItem'

const RECENT_LIMIT = 5

export function NotificationsBell() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const { toast } = useToast()
  // Tying the open state to the tenant closes the panel on a tenant switch
  // without a state-setting effect.
  const [openTenantId, setOpenTenantId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const invalidate = useNotificationInvalidate(tenantId)

  const unreadQuery = useNotificationUnreadCount(tenantId)
  const listQuery = useNotifications(tenantId, 'all', 0, { pageSize: RECENT_LIMIT })

  const unreadCount = Math.max(0, unreadQuery.data ?? 0)
  const badge = formatUnreadCount(unreadCount)
  const items = listQuery.data?.items ?? []
  const loading = listQuery.isLoading || unreadQuery.isLoading
  const failed = listQuery.isError || unreadQuery.isError
  const open = Boolean(tenantId) && openTenantId === tenantId

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenTenantId(null)
    }
    const onPointerDown = (event: MouseEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return
      setOpenTenantId(null)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open])

  const handleMarkOne = async (id: string) => {
    if (!tenantId || busyId) return
    setBusyId(id)
    try {
      await markNotificationRead(tenantId, id)
      toast({ title: 'Marked as read' })
      invalidate()
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
      invalidate()
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

  const retry = () => {
    void listQuery.refetch()
    void unreadQuery.refetch()
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpenTenantId(open ? null : tenantId ?? null)}
        className="relative flex size-9 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100"
      >
        <Bell className="size-4" />
        {badge ? (
          <Badge
            variant="danger"
            className="absolute -right-1.5 -top-1.5 min-w-4 justify-center px-1 py-0 text-[10px] leading-4"
          >
            {badge}
          </Badge>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-ink-200 bg-white p-2 shadow-popover"
        >
          <div className="mb-1 flex items-center justify-between gap-2 px-1.5 py-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Notifications</p>
              {badge ? (
                <Badge variant="brand" className="px-1.5 py-0 text-[10px]">
                  {badge} new
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={markingAll || unreadCount === 0 || loading || failed}
                onClick={() => { void handleMarkAll() }}
                className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-40"
              >
                {markingAll ? 'Saving…' : 'Mark all read'}
              </button>
              <button
                type="button"
                aria-label="Close notifications"
                onClick={() => setOpenTenantId(null)}
                className="text-ink-400 hover:text-ink-700"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-2">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-12" />)}</div>
            ) : failed ? (
              <ErrorState message="We couldn't load your notifications." onRetry={retry} />
            ) : items.length === 0 ? (
              <EmptyState
                icon={<Bell className="size-5" />}
                title="You're all caught up."
                description="Appointment and inbox updates will appear here."
              />
            ) : (
              <ul className="divide-y divide-ink-100">
                {items.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    compact
                    busy={busyId === notification.id}
                    onMarkRead={(id) => { void handleMarkOne(id) }}
                    onNavigate={() => setOpenTenantId(null)}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="mt-1 border-t border-ink-100 pt-1">
            <Link
              to="/app/notifications"
              onClick={() => setOpenTenantId(null)}
              className="block rounded-lg px-2.5 py-2 text-center text-xs font-semibold text-brand-600 hover:bg-brand-50"
            >
              View all notifications
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
