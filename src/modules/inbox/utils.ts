import type { ConversationRow, ConversationStatus } from '@/types/database'

export type ConversationFilterInput = {
  status: ConversationStatus | ''
  search: string
  /** Optional channel id -> display name map from the tenant's channels. */
  channelNames?: Record<string, string>
}

export function conversationTitle(conversation: ConversationRow): string {
  return conversation.subject?.trim() || conversation.customer_name?.trim() || 'Untitled conversation'
}

export function conversationCustomer(conversation: ConversationRow): string {
  return conversation.customer_name?.trim() || conversation.customer_email?.trim() || 'Unknown customer'
}

/** Client-side status/search filtering over the tenant-scoped conversation rows. */
export function filterConversations(
  conversations: ConversationRow[],
  filters: ConversationFilterInput,
): ConversationRow[] {
  const needle = filters.search.trim().toLowerCase()
  return conversations.filter((conversation) => {
    if (filters.status && conversation.status !== filters.status) return false
    if (!needle) return true

    const channelName = filters.channelNames?.[conversation.channel_id ?? ''] ?? ''
    const haystack = [
      conversationTitle(conversation),
      conversationCustomer(conversation),
      conversation.customer_email,
      conversation.channel,
      channelName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(needle)
  })
}
