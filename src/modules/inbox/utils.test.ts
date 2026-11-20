import { describe, expect, it } from 'vitest'
import type { ConversationRow } from '@/types/database'
import { conversationCustomer, conversationTitle, filterConversations } from './utils'

function conversation(overrides: Partial<ConversationRow> = {}): ConversationRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    tenant_id: 't-1',
    contact_id: null,
    channel: 'email',
    channel_id: 'channel-email',
    subject: 'Booking question',
    status: 'open',
    priority: 'normal',
    unread_count: 0,
    assigned_to: null,
    customer_name: 'Asha Sharma',
    customer_email: 'asha@example.test',
    ai_status: 'active',
    ai_handed_off_at: null,
    last_message_at: '2026-01-01T10:00:00Z',
    created_at: '2026-01-01T09:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
    ...overrides,
  }
}

describe('inbox conversation helpers', () => {
  it('falls back from subject to customer name and then to a placeholder title', () => {
    expect(conversationTitle(conversation())).toBe('Booking question')
    expect(conversationTitle(conversation({ subject: null }))).toBe('Asha Sharma')
    expect(conversationTitle(conversation({ subject: null, customer_name: null }))).toBe('Untitled conversation')
    expect(conversationCustomer(conversation())).toBe('Asha Sharma')
    expect(conversationCustomer(conversation({ customer_name: null }))).toBe('asha@example.test')
    expect(conversationCustomer(conversation({ customer_name: null, customer_email: null }))).toBe('Unknown customer')
  })

  it('filters by status without dropping closed or pending conversations', () => {
    const rows = [
      conversation(),
      conversation({ id: 'b', status: 'pending', subject: 'Reschedule' }),
      conversation({ id: 'c', status: 'closed', subject: 'Old request', customer_name: 'Ravi' }),
    ]
    expect(filterConversations(rows, { status: '', search: '' })).toHaveLength(3)
    expect(filterConversations(rows, { status: 'open', search: '' }).map((row) => row.id)).toEqual([
      '11111111-1111-4111-8111-111111111111',
    ])
    expect(filterConversations(rows, { status: 'pending', search: '' })[0]?.id).toBe('b')
    expect(filterConversations(rows, { status: 'closed', search: '' })[0]?.id).toBe('c')
  })

  it('searches subject, customer, legacy channel and channel name case-insensitively', () => {
    const rows = [
      conversation(),
      conversation({ id: 'b', subject: 'Other', customer_name: 'Meera', customer_email: null, channel: 'whatsapp', channel_id: 'channel-wa' }),
    ]
    const channelNames = { 'channel-wa': 'Support WhatsApp' }
    expect(filterConversations(rows, { status: '', search: 'booking', channelNames })).toHaveLength(1)
    expect(filterConversations(rows, { status: '', search: 'MEERA', channelNames })[0]?.id).toBe('b')
    expect(filterConversations(rows, { status: '', search: 'asha@example', channelNames })[0]?.id).toBe(rows[0]?.id)
    expect(filterConversations(rows, { status: '', search: 'whatsapp', channelNames })[0]?.id).toBe('b')
    expect(filterConversations(rows, { status: '', search: 'support', channelNames })[0]?.id).toBe('b')
    expect(filterConversations(rows, { status: '', search: 'missing', channelNames })).toHaveLength(0)
  })

  it('combines status and search filters', () => {
    const rows = [
      conversation(),
      conversation({ id: 'b', status: 'closed', subject: 'Booking question' }),
    ]
    expect(filterConversations(rows, { status: 'closed', search: 'booking' }).map((row) => row.id)).toEqual(['b'])
  })
})
