import { z } from 'zod'

/** Statuses accepted by `inbox_set_conversation_status` (migration 0010). */
export const conversationStatuses = ['open', 'pending', 'closed'] as const

/**
 * Reply validation mirrors `inbox_send_message`: 1-10000 characters after trim.
 * The database remains authoritative; this only gives early form feedback.
 */
export const replySchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Write a message first')
    .max(10000, 'Messages are limited to 10000 characters'),
  is_internal: z.boolean(),
})
export type ReplyFormValues = z.infer<typeof replySchema>

/** Every field is optional on `inbox_create_conversation`; the form uses strings. */
export const newConversationSchema = z.object({
  contact_id: z.string(),
  channel_id: z.string(),
  subject: z.string().trim().max(160, 'Subject is too long'),
  customer_name: z.string().trim().max(120, 'Customer name is too long'),
  customer_email: z.union([z.string().trim().email('Enter a valid email address'), z.literal('')]),
  assigned_to: z.string(),
})
export type NewConversationFormValues = z.infer<typeof newConversationSchema>
