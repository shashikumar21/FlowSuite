import { describe, expect, it } from 'vitest'
import {
  entityHref,
  formatUnreadCount,
  getNotificationMeta,
  notificationTypeMeta,
  type NotificationType,
} from './utils'

describe('notification presentation helpers', () => {
  it('describes every known notification type with a label, tone and icon', () => {
    const types: NotificationType[] = [
      'appointment_new',
      'appointment_confirmed',
      'appointment_cancelled',
      'appointment_rescheduled',
      'appointment_upcoming',
      'conversation_assigned',
      'message_received',
    ]

    expect(Object.keys(notificationTypeMeta).sort()).toEqual([...types].sort())
    for (const type of types) {
      const meta = getNotificationMeta(type)
      expect(meta.label.length).toBeGreaterThan(0)
      expect(meta.tone).toBeTruthy()
      expect(meta.icon).toBeTruthy()
    }
  })

  it('falls back safely for an unrecognised type', () => {
    expect(getNotificationMeta('something_new')).toEqual({
      label: 'Notification',
      tone: 'neutral',
      icon: 'bell',
    })
  })

  it('links only to destinations that exist in the app', () => {
    expect(entityHref('appointment')).toBe('/app/appointments')
    expect(entityHref('conversation')).toBe('/app/conversations')
    expect(entityHref('contact')).toBeNull()
    expect(entityHref(null)).toBeNull()
    expect(entityHref(undefined)).toBeNull()
  })

  it('formats the unread badge without inventing a count', () => {
    expect(formatUnreadCount(0)).toBe('')
    expect(formatUnreadCount(-3)).toBe('')
    expect(formatUnreadCount(1)).toBe('1')
    expect(formatUnreadCount(12)).toBe('12')
    expect(formatUnreadCount(99)).toBe('99')
    expect(formatUnreadCount(150)).toBe('99+')
    expect(formatUnreadCount(Number.NaN)).toBe('')
  })
})
