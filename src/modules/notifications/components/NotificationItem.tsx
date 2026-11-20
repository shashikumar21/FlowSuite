import { Link } from 'react-router-dom'
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock,
  MessageSquare,
  UserRound,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import type { NotificationRow } from '@/types/database'
import {
  entityHref,
  getNotificationMeta,
  type NotificationIconName,
  type NotificationTone,
} from '../utils'

const icons: Record<NotificationIconName, LucideIcon> = {
  bell: Bell,
  calendar: CalendarDays,
  check: CheckCircle2,
  clock: Clock,
  message: MessageSquare,
  user: UserRound,
  x: XCircle,
}

const toneClasses: Record<NotificationTone, string> = {
  neutral: 'bg-ink-100 text-ink-600',
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-red-50 text-red-600',
}

type NotificationItemProps = {
  notification: NotificationRow
  compact?: boolean
  busy?: boolean
  onMarkRead: (id: string) => void
  onNavigate?: () => void
}

/** Shared by the header popover and the full notifications screen. */
export function NotificationItem({
  notification,
  compact = false,
  busy = false,
  onMarkRead,
  onNavigate,
}: NotificationItemProps) {
  const meta = getNotificationMeta(notification.notification_type)
  const Icon = icons[meta.icon]
  const href = entityHref(notification.entity_type)
  const unread = notification.read_at === null
  const createdAt = formatDateTime(notification.created_at)

  return (
    <li className={cn('flex gap-3 px-4 py-4', compact && 'py-3', unread && 'bg-brand-50/40')}>
      <span
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
          toneClasses[meta.tone],
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          {href ? (
            <Link
              to={href}
              onClick={onNavigate}
              className="text-sm font-semibold text-ink-900 hover:text-brand-600 hover:underline"
            >
              {notification.title}
            </Link>
          ) : (
            <p className="text-sm font-semibold text-ink-900">{notification.title}</p>
          )}
          {unread ? (
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-600" title="Unread" />
          ) : null}
        </div>

        {notification.body ? (
          <p className={cn('mt-0.5 text-xs text-ink-600', compact ? 'line-clamp-2' : 'line-clamp-3')}>
            {notification.body}
          </p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Badge variant={meta.tone} className="px-2 py-0 text-[10px]">
            {meta.label}
          </Badge>
          <time dateTime={notification.created_at} title={createdAt} className="text-[11px] text-ink-500">
            {createdAt}
          </time>
          {unread ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onMarkRead(notification.id)}
              className="ml-auto text-[11px] font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Mark as read'}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  )
}
