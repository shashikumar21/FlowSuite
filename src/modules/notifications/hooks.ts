import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchNotifications,
  fetchUnreadCount,
  fetchUnreadNotifications,
  NOTIFICATION_PAGE_SIZE,
} from './api'

export type NotificationFilter = 'all' | 'unread'

export const notificationKeys = {
  all: (tenantId: string) => ['notifications', tenantId] as const,
  list: (tenantId: string) => ['notifications', tenantId, 'list'] as const,
  unreadCount: (tenantId: string) => ['notifications', tenantId, 'unread-count'] as const,
}

/** Every read-state write changes both the bell count and the visible lists. */
export function useNotificationInvalidate(tenantId: string | undefined) {
  const queryClient = useQueryClient()
  return () => {
    if (!tenantId) return
    void queryClient.invalidateQueries({ queryKey: notificationKeys.all(tenantId) })
  }
}

export function useNotificationUnreadCount(tenantId: string | undefined, refetchInterval = 30_000) {
  return useQuery({
    queryKey: notificationKeys.unreadCount(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchUnreadCount(tenantId as string),
    refetchInterval,
  })
}

export type NotificationListOptions = {
  pageSize?: number
  refetchInterval?: number
}

export function useNotifications(
  tenantId: string | undefined,
  filter: NotificationFilter = 'all',
  page = 0,
  options: NotificationListOptions = {},
) {
  const pageSize = options.pageSize ?? NOTIFICATION_PAGE_SIZE
  const offset = page * pageSize

  return useQuery({
    queryKey: [...notificationKeys.list(tenantId ?? ''), filter, page, pageSize] as const,
    enabled: Boolean(tenantId),
    queryFn: () =>
      filter === 'unread'
        ? fetchUnreadNotifications(tenantId as string, pageSize, offset)
        : fetchNotifications(tenantId as string, { limit: pageSize, offset }),
    refetchInterval: options.refetchInterval ?? 30_000,
  })
}
