import type { NotificationRow } from '@/types/database'

export type NotificationType = NotificationRow['notification_type']
export type NotificationTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'
export type NotificationIconName = 'bell' | 'calendar' | 'check' | 'clock' | 'message' | 'user' | 'x'

export type NotificationMeta = {
  label: string
  tone: NotificationTone
  icon: NotificationIconName
}

export const notificationTypeMeta: Record<NotificationType, NotificationMeta> = {
  appointment_new: { label: 'New appointment', tone: 'brand', icon: 'calendar' },
  appointment_confirmed: { label: 'Appointment confirmed', tone: 'success', icon: 'check' },
  appointment_cancelled: { label: 'Appointment cancelled', tone: 'danger', icon: 'x' },
  appointment_rescheduled: { label: 'Appointment rescheduled', tone: 'warning', icon: 'clock' },
  appointment_upcoming: { label: 'Upcoming appointment', tone: 'brand', icon: 'calendar' },
  conversation_assigned: { label: 'Conversation assigned', tone: 'brand', icon: 'user' },
  message_received: { label: 'New message', tone: 'brand', icon: 'message' },
}

const fallbackMeta: NotificationMeta = { label: 'Notification', tone: 'neutral', icon: 'bell' }

/** Defensive: an older database row may carry a type we do not know yet. */
export function getNotificationMeta(type: string): NotificationMeta {
  return notificationTypeMeta[type as NotificationType] ?? fallbackMeta
}

/** Only entity types with a real in-app destination get a link. */
export function entityHref(entityType: string | null | undefined): string | null {
  if (entityType === 'appointment') return '/app/appointments'
  if (entityType === 'conversation') return '/app/conversations'
  return null
}

/** Empty for zero so callers can hide the badge entirely. */
export function formatUnreadCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return ''
  return count > 99 ? '99+' : String(Math.floor(count))
}
