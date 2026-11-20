import { useState } from 'react'
import { useToast } from '@/app/providers/ToastProvider'
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/Feedback'
import { Label, Select } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { getErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import type { ConversationRow, ConversationStatus, MessageRow } from '@/types/database'
import { assignInboxConversation, setInboxConversationStatus, type InboxMemberOption } from '../api'
import { useInboxInvalidate } from '../hooks'
import { conversationStatuses } from '../schemas'
import { conversationCustomer, conversationTitle } from '../utils'
import { ConversationStatusBadge, PriorityBadge } from './ConversationBadges'
import { ReplyComposer } from './ReplyComposer'

type Props = {
  tenantId: string
  conversation: ConversationRow
  messages: MessageRow[]
  members: InboxMemberOption[]
  channelName: string
}

export function ConversationThread({ tenantId, conversation, messages, members, channelName }: Props) {
  const { toast } = useToast()
  const invalidate = useInboxInvalidate(tenantId)
  const [busy, setBusy] = useState(false)

  const handleAssign = async (userId: string) => {
    if (!userId || userId === conversation.assigned_to) return
    setBusy(true)
    try {
      await assignInboxConversation(tenantId, conversation.id, userId)
      toast({ title: 'Conversation assigned' })
      invalidate()
    } catch (error) {
      toast({
        title: 'Could not assign conversation',
        description: getErrorMessage(error),
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  const handleStatus = async (status: ConversationStatus) => {
    if (status === conversation.status) return
    setBusy(true)
    try {
      await setInboxConversationStatus(tenantId, conversation.id, status)
      toast({ title: 'Status updated', description: `Conversation marked ${status}.` })
      invalidate()
    } catch (error) {
      toast({
        title: 'Could not update status',
        description: getErrorMessage(error),
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>{conversationTitle(conversation)}</CardTitle>
            <CardDescription>
              {conversationCustomer(conversation)} · {channelName}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ConversationStatusBadge status={conversation.status} />
            <PriorityBadge priority={conversation.priority} />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full min-w-40 sm:w-64">
            <Label htmlFor="inbox-assignee">Assigned to</Label>
            <Select
              id="inbox-assignee"
              disabled={busy}
              value={conversation.assigned_to ?? ''}
              onChange={(event) => { void handleAssign(event.target.value) }}
            >
              {!conversation.assigned_to ? <option value="" disabled>Unassigned</option> : null}
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.full_name ?? member.user_id} ({member.role})
                </option>
              ))}
            </Select>
          </div>
          <div className="w-36">
            <Label htmlFor="inbox-status">Status</Label>
            <Select
              id="inbox-status"
              disabled={busy}
              value={conversation.status}
              onChange={(event) => { void handleStatus(event.target.value as ConversationStatus) }}
            >
              {conversationStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {messages.length === 0 ? (
          <EmptyState title="No messages yet" description="Send the first reply or leave an internal note below." />
        ) : (
          <ul className="space-y-3">
            {messages.map((message) => {
              const outbound = message.direction === 'outbound'
              const internal = message.is_internal
              const author =
                message.author_type === 'customer'
                  ? conversationCustomer(conversation)
                  : message.author_type === 'system'
                    ? 'System'
                    : message.author_type === 'bot'
                      ? 'Bot'
                      : 'Your team'

              return (
                <li key={message.id} className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[85%] rounded-xl px-3 py-2 text-sm shadow-xs',
                      internal
                        ? 'w-full max-w-full border border-amber-300 bg-amber-50 text-amber-900'
                        : outbound
                          ? 'bg-brand-600 text-white'
                          : 'bg-ink-100 text-ink-900',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-wide">
                      <span>{internal ? 'Internal note' : author}</span>
                      <span
                        className={cn(
                          'font-normal',
                          internal ? 'text-amber-700' : outbound ? 'text-brand-100' : 'text-ink-500',
                        )}
                      >
                        {formatDateTime(message.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words">{message.content ?? '—'}</p>
                    {message.delivery_status && !internal ? (
                      <p className={cn('mt-1 text-[11px] capitalize', outbound ? 'text-brand-100' : 'text-ink-500')}>
                        {message.delivery_status}
                      </p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      <CardFooter>
        <div className="w-full">
          <ReplyComposer tenantId={tenantId} conversationId={conversation.id} />
        </div>
      </CardFooter>
    </>
  )
}
