import { describe, expect, it } from 'vitest'
import { newConversationSchema, replySchema } from './schemas'

describe('inbox form schemas', () => {
  it('accepts a reply and trims surrounding whitespace', () => {
    const parsed = replySchema.parse({ content: '  Hello there  ', is_internal: false })
    expect(parsed).toEqual({ content: 'Hello there', is_internal: false })
  })

  it('rejects empty or oversized replies and accepts internal notes', () => {
    expect(replySchema.safeParse({ content: '   ', is_internal: false }).success).toBe(false)
    expect(replySchema.safeParse({ content: 'x'.repeat(10001), is_internal: false }).success).toBe(false)
    expect(replySchema.safeParse({ content: 'x'.repeat(10000), is_internal: true }).success).toBe(true)
  })

  it('allows optional new-conversation fields but validates emails and lengths', () => {
    const empty = {
      contact_id: '',
      channel_id: '',
      subject: '',
      customer_name: '',
      customer_email: '',
      assigned_to: '',
    }
    expect(newConversationSchema.safeParse(empty).success).toBe(true)
    expect(newConversationSchema.safeParse({ ...empty, customer_email: 'not-an-email' }).success).toBe(false)
    expect(newConversationSchema.safeParse({ ...empty, subject: 'x'.repeat(161) }).success).toBe(false)
    expect(newConversationSchema.parse({ ...empty, subject: ' Booking help ', customer_name: ' Asha ' })).toMatchObject({
      subject: 'Booking help',
      customer_name: 'Asha',
    })
  })
})
