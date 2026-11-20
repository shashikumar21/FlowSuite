import { useEffect, useMemo, useRef, useState } from 'react'
import { Inbox as InboxIcon, MessageSquarePlus, Search } from 'lucide-react'
import { useAuth } from '@/app/providers/AuthProvider'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Input, Label, Select } from '@/components/ui/Input'
import { getErrorMessage } from '@/lib/errors'
import type { ConversationStatus } from '@/types/database'
import { markInboxConversationRead } from '../api'
import { ConversationList } from '../components/ConversationList'
import { ConversationThread } from '../components/ConversationThread'
import { NewConversationModal } from '../components/NewConversationModal'
import {
  useInboxConversations,
  useInboxInvalidate,
  useInboxMessages,
  useInboxMetrics,
  useInboxOptions,
} from '../hooks'
import { conversationStatuses } from '../schemas'
import { filterConversations } from '../utils'

export function InboxPage() {
  const { user } = useAuth()
  const { activeTenant } = useTenant()
  const { toast } = useToast()
  const tenantId = activeTenant?.tenant_id
  const invalidate = useInboxInvalidate(tenantId)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ConversationStatus | ''>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const markedRef = useRef<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const conversationsQuery = useInboxConversations(tenantId)
  const metricsQuery = useInboxMetrics(tenantId)
  const optionsQuery = useInboxOptions(tenantId)
  const messagesQuery = useInboxMessages(tenantId, selectedId)

  const conversations = useMemo(() => conversationsQuery.data ?? [], [conversationsQuery.data])
  const options = optionsQuery.data
  const channelNames = useMemo(
    () => Object.fromEntries((options?.channels ?? []).map((channel) => [channel.id, channel.name])),
    [options],
  )
  const memberNames = useMemo(
    () => Object.fromEntries((options?.members ?? []).map((member) => [member.user_id, member.full_name ?? member.user_id])),
    [options],
  )
  const visibleConversations = useMemo(
    () => filterConversations(conversations, { status, search, channelNames }),
    [conversations, status, search, channelNames],
  )
  const selected = conversations.find((item) => item.id === selectedId) ?? null
  const hasFilters = Boolean(status || search)

  // Opening a thread clears its unread state; guard avoids duplicate writes on re-renders.
  useEffect(() => {
    if (!tenantId || !selectedId || markedRef.current === selectedId) return
    markedRef.current = selectedId
    void (async () => {
      try {
        await markInboxConversationRead(tenantId, selectedId)
        invalidate()
      } catch (error) {
        toast({
          title: 'Could not mark this conversation as read',
          description: getErrorMessage(error),
          variant: 'error',
        })
      }
    })()
  }, [tenantId, selectedId, invalidate, toast])

  const metricCards = [
    { label: 'Open', value: metricsQuery.data?.open_count, tone: 'text-emerald-600' },
    { label: 'Pending', value: metricsQuery.data?.pending_count, tone: 'text-amber-600' },
    { label: 'Closed', value: metricsQuery.data?.closed_count, tone: 'text-ink-600' },
    { label: 'Unassigned', value: metricsQuery.data?.unassigned_count, tone: 'text-brand-600' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Communication</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Inbox</h1>
          <p className="mt-1 text-sm text-ink-500">
            Tenant-scoped conversations. Closed and pending threads stay available through the status filter.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <MessageSquarePlus className="size-4" /> New conversation
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metricCards.map((metric) => (
            <div key={metric.label} className="rounded-lg border border-ink-100 bg-ink-50/50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-500">{metric.label}</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${metric.tone}`}>{metric.value ?? '—'}</p>
            </div>
          ))}
          {metricsQuery.isError ? (
            <p className="text-xs text-amber-700 sm:col-span-2 lg:col-span-4">
              Live metrics are unavailable right now. Counts will return when the service is reachable.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="inbox-search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
                <Input
                  id="inbox-search"
                  className="pl-9"
                  placeholder="Subject, customer, email or channel"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="inbox-filter-status">Status</Label>
              <Select
                id="inbox-filter-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as ConversationStatus | '')}
              >
                <option value="">All statuses</option>
                {conversationStatuses.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </Select>
            </div>
          </div>
          {hasFilters ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => { setSearchInput(''); setSearch(''); setStatus('') }}
            >
              Clear filters
            </Button>
          ) : null}
          {optionsQuery.isError ? (
            <p className="text-xs text-amber-700">
              Channels and members could not be loaded, so some labels and assignment options may be empty.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="border-b border-ink-100 px-4 py-3 text-sm font-semibold text-ink-900">
            Conversations <span className="font-normal text-ink-500">({visibleConversations.length})</span>
          </div>
          {conversationsQuery.isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2, 3, 4].map((index) => <Skeleton key={index} className="h-16" />)}</div>
          ) : conversationsQuery.isError ? (
            <ErrorState
              message="We couldn't load conversations for this business."
              onRetry={() => { void conversationsQuery.refetch() }}
            />
          ) : visibleConversations.length === 0 ? (
            <EmptyState
              icon={<InboxIcon className="size-5" />}
              title={hasFilters ? 'No matching conversations' : 'No conversations yet'}
              description={hasFilters ? 'Try a different search or clear the filters.' : 'Create a conversation to start a thread with a customer.'}
              action={!hasFilters ? (
                <Button size="sm" onClick={() => setCreateOpen(true)}>New conversation</Button>
              ) : undefined}
            />
          ) : (
            <ConversationList
              conversations={visibleConversations}
              selectedId={selectedId}
              onSelect={setSelectedId}
              channelNames={channelNames}
              memberNames={memberNames}
            />
          )}
        </Card>

        <Card className="flex min-h-[32rem] flex-col overflow-hidden">
          {!selected ? (
            <EmptyState
              icon={<MessageSquarePlus className="size-5" />}
              title="Select a conversation"
              description="Choose a thread on the left to read messages, reply or leave an internal note."
            />
          ) : messagesQuery.isLoading ? (
            <div className="space-y-3 p-5">{[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-14" />)}</div>
          ) : messagesQuery.isError ? (
            <ErrorState
              message="We couldn't load this conversation's messages."
              onRetry={() => { void messagesQuery.refetch() }}
            />
          ) : (
            <ConversationThread
              tenantId={tenantId ?? ''}
              conversation={selected}
              messages={messagesQuery.data ?? []}
              members={options?.members ?? []}
              channelName={channelNames[selected.channel_id ?? ''] ?? selected.channel}
            />
          )}
        </Card>
      </div>

      <NewConversationModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        tenantId={tenantId ?? ''}
        channels={options?.channels ?? []}
        contacts={options?.contacts ?? []}
        members={options?.members ?? []}
        currentUserId={user?.id ?? ''}
        onCreated={(conversationId) => {
          setStatus('')
          setSearch('')
          setSearchInput('')
          setSelectedId(conversationId)
        }}
      />
    </div>
  )
}
