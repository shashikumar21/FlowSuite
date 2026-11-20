import { requireSupabase } from '@/integrations/supabase/client'
import type { NotificationRow } from '@/types/database'

/** Shared by the list query and the page controls so both use the same slice. */
export const NOTIFICATION_PAGE_SIZE = 20

/** The RPC caps `p_limit` at 50. */
const RPC_SCAN_SIZE = 50

export type NotificationPage = {
  items: NotificationRow[]
  totalCount: number
}

export type NotificationListOptions = {
  limit?: number
  offset?: number
}

/** Tenant and recipient are derived from the session inside the RPC. */
export async function fetchNotifications(
  tenantId: string,
  options: NotificationListOptions = {},
): Promise<NotificationPage> {
  const { data, error } = await requireSupabase().rpc('notifications_list', {
    p_tenant: tenantId,
    p_limit: options.limit ?? NOTIFICATION_PAGE_SIZE,
    p_offset: options.offset ?? 0,
  })
  if (error) throw error
  return {
    items: data?.items ?? [],
    totalCount: Number(data?.total_count ?? 0),
  }
}

export async function fetchUnreadCount(tenantId: string): Promise<number> {
  const { data, error } = await requireSupabase().rpc('notifications_unread_count', {
    p_tenant: tenantId,
  })
  if (error) throw error
  return Number(data ?? 0)
}

/**
 * `notifications_list` has no read-state filter, so walk its ordered pages
 * until the requested unread slice is filled. Paging still comes from the RPC;
 * the unread total comes from `notifications_unread_count`.
 */
export async function fetchUnreadNotifications(
  tenantId: string,
  limit: number,
  offset: number,
): Promise<NotificationPage> {
  const [firstPage, unreadCount] = await Promise.all([
    fetchNotifications(tenantId, { limit: RPC_SCAN_SIZE, offset: 0 }),
    fetchUnreadCount(tenantId),
  ])

  if (firstPage.items.length === 0 || unreadCount === 0) {
    return { items: [], totalCount: unreadCount }
  }

  const unread = firstPage.items.filter((item) => item.read_at === null)
  let scanned = firstPage.items.length

  while (unread.length < offset + limit && scanned < firstPage.totalCount) {
    const nextPage = await fetchNotifications(tenantId, { limit: RPC_SCAN_SIZE, offset: scanned })
    if (nextPage.items.length === 0) break
    unread.push(...nextPage.items.filter((item) => item.read_at === null))
    scanned += nextPage.items.length
  }

  return { items: unread.slice(offset, offset + limit), totalCount: unreadCount }
}

export async function markNotificationRead(tenantId: string, notificationId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('notifications_mark_read', {
    p_tenant: tenantId,
    p_notification: notificationId,
  })
  if (error) throw error
}

export async function markAllNotificationsRead(tenantId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('notifications_mark_all_read', { p_tenant: tenantId })
  if (error) throw error
}
