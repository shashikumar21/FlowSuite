import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Feedback'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import type { ConversationRow } from '@/types/database'
import { conversationCustomer, conversationTitle } from '../utils'
import { ConversationStatusBadge, PriorityBadge } from './ConversationBadges'

type Props = {
  conversations: ConversationRow[]
  selectedId: string | null
  onSelect: (conversationId: string) => void
  channelNames: Record<string, string>
  memberNames: Record<string, string>
}

export function ConversationList({ conversations, selectedId, onSelect, channelNames, memberNames }: Props) {
  return (
    <ul className="divide-y divide-ink-100">
      {conversations.map((conversation) => {
        const channel = channelNames[conversation.channel_id ?? ''] ?? conversation.channel
        const assignee = conversation.assigned_to ? memberNames[conversation.assigned_to] : undefined
        return (
          <li key={conversation.id}>
            <button
              type="button"
              onClick={() => onSelect(conversation.id)}
              aria-current={selectedId === conversation.id ? 'true' : undefined}
              className={cn(
                'w-full px-4 py-3 text-left transition',
                selectedId === conversation.id ? 'bg-brand-50' : 'hover:bg-ink-50',
              )}
            >
              <div className="flex items-start gap-3">
                <Avatar name={conversation.customer_name ?? conversationTitle(conversation)} className="size-8" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-ink-900">{conversationTitle(conversation)}</p>
                    {conversation.unread_count > 0 ? (
                      <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">
                        {conversation.unread_count}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-500">
                    {conversationCustomer(conversation)} · {channel}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <ConversationStatusBadge status={conversation.status} />
                    <PriorityBadge priority={conversation.priority} />
                    {assignee ? (
                      <Badge variant="brand">{assignee}</Badge>
                    ) : (
                      <Badge variant="warning">Unassigned</Badge>
                    )}
                    <span className="ml-auto text-[11px] text-ink-400">
                      {formatDateTime(conversation.last_message_at)}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
