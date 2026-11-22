import { useState } from 'react'
import { Inbox, MessageSquare, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Select } from '@/components/ui/Input'
import { getErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import type { OutreachReplyRow } from '@/types/database'
import { ReplyFormModal } from '../components/ReplyFormModal'
import { useDeleteReply, useProspectOptions, useReplyViews, useUpdateReply } from '../hooks'
import { replyClassifications, replyStatuses, replyTriageSchema } from '../schemas'
import type { ReplyClassification, ReplyStatus } from '../schemas'
import { canManageContacts, classificationLabel, replyStatusLabel } from '../utils'
import type { ReplyView } from '../api'

function classificationVariant(value: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (value === 'interested') return 'success'
  if (value === 'follow_up_required') return 'warning'
  if (value === 'not_interested' || value === 'unsubscribe') return 'danger'
  return 'neutral'
}

/** Keyed by the server values so a successful save resets local edits. */
function ReplyRow({
  view,
  tenantId,
  canManage,
  prospectName,
  onChanged,
}: {
  view: ReplyView
  tenantId: string
  canManage: boolean
  prospectName: string
  onChanged: () => void
}) {
  const reply: OutreachReplyRow = view.reply
  const { toast } = useToast()
  const update = useUpdateReply(tenantId)
  const remove = useDeleteReply(tenantId)
  const [status, setStatus] = useState<ReplyStatus>(reply.reply_status)
  const [classification, setClassification] = useState<ReplyClassification>(reply.classification)

  async function save() {
    const parsed = replyTriageSchema.safeParse({
      reply_id: reply.id,
      reply_status: status,
      classification,
    })
    if (!parsed.success) return
    try {
      await update.mutateAsync({ reply_id: reply.id, reply_status: status, classification })
      toast({
        title: 'Reply updated',
        description: classification === 'unsubscribe' ? 'The sender was added to the suppression list.' : undefined,
      })
      onChanged()
    } catch (error) {
      toast({ title: 'Could not update reply', description: getErrorMessage(error), variant: 'error' })
    }
  }

  async function handleDelete() {
    if (!canManage || !window.confirm('Delete this reply? This cannot be undone.')) return
    try {
      await remove.mutateAsync(reply.id)
      toast({ title: 'Reply deleted' })
      onChanged()
    } catch (error) {
      toast({ title: 'Could not delete reply', description: getErrorMessage(error), variant: 'error' })
    }
  }

  return (
    <li className="space-y-3 border-b border-ink-100 py-4 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink-900">{prospectName}</span>
            <Badge variant={classificationVariant(reply.classification)}>{classificationLabel(reply.classification)}</Badge>
            <Badge variant="neutral">{replyStatusLabel(reply.reply_status)}</Badge>
            {reply.classification === 'unsubscribe' ? (
              <Badge variant="warning"><ShieldAlert className="mr-1 size-3" /> Suppressed</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-ink-500">
            {reply.sender_email || 'Unknown sender'} · {formatDateTime(reply.received_at)} · {reply.provider}
            {view.messageSubject ? ` · Re: ${view.messageSubject}` : ''}
          </p>
        </div>
        {canManage ? (
          <Button variant="ghost" size="sm" onClick={() => void handleDelete()} aria-label="Delete reply">
            <Trash2 className="size-4 text-red-600" />
          </Button>
        ) : null}
      </div>

      {reply.body ? <p className="whitespace-pre-wrap text-sm text-ink-700">{reply.body}</p> : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="text-xs font-semibold text-ink-700">Status</span>
          <Select value={status} onChange={(event) => setStatus(event.target.value as ReplyStatus)}>
            {replyStatuses.map((value) => <option key={value} value={value}>{replyStatusLabel(value)}</option>)}
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-ink-700">Classification</span>
          <Select value={classification} onChange={(event) => setClassification(event.target.value as ReplyClassification)}>
            {replyClassifications.map((value) => <option key={value} value={value}>{classificationLabel(value)}</option>)}
          </Select>
        </label>
        {(status !== reply.reply_status || classification !== reply.classification) ? (
          <Button size="sm" onClick={() => void save()} disabled={update.isPending} loading={update.isPending}>Save</Button>
        ) : null}
      </div>
    </li>
  )
}

export function RepliesPage() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const canManage = canManageContacts(activeTenant?.role)
  const repliesQuery = useReplyViews(tenantId)
  const prospectsQuery = useProspectOptions(tenantId)

  const [formOpen, setFormOpen] = useState(false)

  if (!tenantId) return <ErrorState message="Select a business to manage its replies." />

  const replies = repliesQuery.data ?? []
  const prospects = prospectsQuery.data ?? []
  const prospectNames = new Map(prospects.map((item) => [item.id, item.business_name]))
  const refetch = () => { void repliesQuery.refetch(); void prospectsQuery.refetch() }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Replies</h1>
          <p className="mt-1 text-sm text-ink-500">
            Record and triage replies you received. Nothing is fetched from an inbox or email provider.
          </p>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)} disabled={prospects.length === 0}>
          <Plus className="size-4" /> Record reply
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Reply inbox</CardTitle>
          <CardDescription>
            Marking a reply as unsubscribe adds the sender to the suppression list on the server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {repliesQuery.isLoading || prospectsQuery.isLoading ? (
            <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
          ) : repliesQuery.isError || prospectsQuery.isError ? (
            <ErrorState
              message={getErrorMessage(repliesQuery.error ?? prospectsQuery.error)}
              onRetry={refetch}
            />
          ) : replies.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="size-5" />}
              title="No replies recorded"
              description="Use Record reply to add one manually. No provider is connected yet."
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {replies.map((view) => (
                <ReplyRow
                  key={`${view.reply.id}:${view.reply.reply_status}:${view.reply.classification}`}
                  view={view}
                  tenantId={tenantId}
                  canManage={canManage}
                  prospectName={prospectNames.get(view.reply.prospect_id) ?? 'Unknown prospect'}
                  onChanged={refetch}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {formOpen ? (
        <ReplyFormModal
          key="reply-form"
          open
          onClose={() => setFormOpen(false)}
          tenantId={tenantId}
          prospects={prospects}
          onSaved={refetch}
        />
      ) : null}

      <p className="flex items-center gap-2 text-xs text-ink-500">
        <Inbox className="size-4" /> Replies are stored only when you enter them here.
      </p>
    </div>
  )
}
