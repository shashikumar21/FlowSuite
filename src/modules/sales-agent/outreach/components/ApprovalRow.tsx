import { useEffect, useState } from 'react'
import { AlertTriangle, Check, History, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { getErrorMessage } from '@/lib/errors'
import { useReviewDraft } from '../hooks'
import { approvalDecisionSchema } from '../schemas'
import type { ApprovalHistoryItem, DraftView } from '../types'
import { messageStatusLabel } from '../utils'

export function ApprovalRow({
  view,
  tenantId,
  canReview,
  suppressed,
  history,
  onChanged,
}: {
  view: DraftView
  tenantId: string
  canReview: boolean
  suppressed: boolean
  history: ApprovalHistoryItem[]
  onChanged?: () => void
}) {
  const { message, prospect } = view
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState(message.subject)
  const [body, setBody] = useState(message.body)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const review = useReviewDraft(tenantId)

  useEffect(() => {
    setSubject(message.subject)
    setBody(message.body)
    setEditing(false)
    setReason('')
    setError(null)
  }, [message])

  async function decide(decision: 'approve' | 'reject') {
    setError(null)
    const parsed = approvalDecisionSchema.safeParse({
      draft_id: message.id,
      decision,
      edited_subject: editing ? subject : undefined,
      edited_body: editing ? body : undefined,
      reason,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the review fields.')
      return
    }
    try {
      await review.mutateAsync(parsed.data)
      setEditing(false)
      setReason('')
      onChanged?.()
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  }

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900">{prospect?.business_name ?? 'Prospect unavailable'}</p>
          <p className="mt-0.5 text-xs text-ink-500">{message.recipient_email || 'No recipient email'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="warning">{messageStatusLabel(message.status)}</Badge>
          <Badge variant={message.generation_source === 'ai' ? 'success' : 'neutral'}>
            {message.generation_source === 'ai' ? 'AI draft' : 'Manual'}
          </Badge>
          {history.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowHistory((value) => !value)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              <History className="size-3.5" /> History ({history.length})
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Subject</span>
          <Input value={subject} onChange={(event) => { setSubject(event.target.value); setEditing(true) }} disabled={review.isPending} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Body preview</span>
          <Textarea className="min-h-40" value={body} onChange={(event) => { setBody(event.target.value); setEditing(true) }} disabled={review.isPending} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Rejection reason (required to reject)</span>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why this draft cannot be approved" disabled={review.isPending} />
        </label>
      </div>

      {suppressed ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Recipient is suppressed. Approval will be refused by the server.
        </p>
      ) : null}

      {showHistory && history.length > 0 ? (
        <div className="mt-4 rounded-lg border border-ink-200 bg-ink-50 p-3">
          <p className="text-xs font-semibold text-ink-700">Approval history</p>
          <ul className="mt-2 space-y-2">
            {history.map((item) => (
              <li key={item.id} className="text-xs text-ink-600">
                <span className={item.decision === 'approved' ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>
                  {item.decision}
                </span>
                {' · '}{new Date(item.created_at).toLocaleString()}
                {item.reason ? ` · ${item.reason}` : ''}
                {item.edited_subject || item.edited_body ? ' · edited before decision' : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-ink-100 pt-4">
        {!canReview ? (
          <p className="mr-auto text-xs text-ink-500">Your role cannot approve outreach. The server enforces this too.</p>
        ) : null}
        <Button
          variant="danger"
          size="sm"
          disabled={!canReview || review.isPending}
          loading={review.isPending && reason.length > 0}
          onClick={() => void decide('reject')}
        >
          <X className="size-4" /> Reject
        </Button>
        <Button
          size="sm"
          disabled={!canReview || review.isPending || suppressed}
          onClick={() => void decide('approve')}
        >
          <Check className="size-4" /> Approve
        </Button>
      </div>
    </div>
  )
}
