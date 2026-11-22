import { useState, type FormEvent } from 'react'
import { useTenant } from '@/app/providers/TenantProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/Input'
import { getErrorMessage } from '@/lib/errors'
import {
  useAddSuppression,
  useDraftViews,
  useOutboxActions,
  useOutboxViews,
  useQueueEmail,
  useSuppression,
} from '../hooks'
import { canReviewOutreach, messageStatusLabel, shortIdempotencyKey } from '../utils'

const SUPPRESSION_REASONS = ['unsubscribe', 'bounced', 'complaint', 'manual'] as const

export function SendingPage() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const canManage = canReviewOutreach(activeTenant?.role)
  const approved = useDraftViews(tenantId, ['approved'])
  const outbox = useOutboxViews(tenantId)
  const suppression = useSuppression(tenantId)
  const queue = useQueueEmail(tenantId)
  const actions = useOutboxActions(tenantId)
  const addSuppression = useAddSuppression(tenantId)
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState<(typeof SUPPRESSION_REASONS)[number]>('manual')
  const [source, setSource] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!tenantId) return <ErrorState message="Select a business to manage its sending queue." />

  async function handleQueue(messageId: string) {
    setError(null)
    setNotice(null)
    try {
      await queue.mutateAsync(messageId)
      setNotice('Added to the queue. No provider is configured, so nothing was sent.')
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  }

  async function handleSuppression(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    try {
      await addSuppression.mutateAsync({ email, reason, source: source || null })
      setEmail('')
      setSource('')
      setNotice('Suppression added. Future approvals and queueing will be refused for this address.')
    } catch (cause) {
      setError(getErrorMessage(cause))
    }
  }

  const busy = queue.isPending || actions.fail.isPending || actions.retry.isPending

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Sending preparation</h1>
        <p className="mt-1 text-sm text-ink-500">
          Queue storage, idempotency, suppression and retry controls — with no live provider attached.
        </p>
      </header>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong className="font-semibold">No email provider is configured.</strong> Queueing stores a durable row with a
        null provider and idempotency key. No message is delivered, and no delivery or open metric is shown.
      </div>

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Approved drafts — not queued</CardTitle>
          <CardDescription>Approved messages that can be placed in the local queue. Queueing is not sending.</CardDescription>
        </CardHeader>
        <CardContent>
          {approved.isLoading ? (
            <Skeleton className="h-24" />
          ) : approved.isError ? (
            <ErrorState message={getErrorMessage(approved.error)} onRetry={() => void approved.refetch()} />
          ) : (approved.data ?? []).length === 0 ? (
            <EmptyState title="No approved drafts" description="Approve a draft in the Approval Inbox first." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {(approved.data ?? []).map((view) => (
                <li key={view.message.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">{view.message.subject}</p>
                    <p className="truncate text-xs text-ink-500">
                      {view.prospect?.business_name ?? 'Unknown'} · {view.message.recipient_email || 'No email'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canManage || busy}
                    onClick={() => void handleQueue(view.message.id)}
                  >
                    Queue (no send)
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Send queue</CardTitle>
          <CardDescription>Idempotent rows. Provider is always null until a provider is explicitly configured in a later phase.</CardDescription>
        </CardHeader>
        <CardContent>
          {outbox.isLoading ? (
            <Skeleton className="h-24" />
          ) : outbox.isError ? (
            <ErrorState message={getErrorMessage(outbox.error)} onRetry={() => void outbox.refetch()} />
          ) : (outbox.data ?? []).length === 0 ? (
            <EmptyState title="Queue is empty" description="Approve and queue a draft to see its idempotent queue row here." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {(outbox.data ?? []).map((item) => (
                <li key={item.outbox.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">
                        {item.message?.subject ?? 'Message unavailable'}
                      </p>
                      <p className="truncate text-xs text-ink-500">{item.outbox.recipient_email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={item.outbox.status === 'failed' ? 'danger' : 'neutral'}>{item.outbox.status}</Badge>
                      <Badge variant="neutral">attempts {item.outbox.attempts}</Badge>
                      <Badge variant="neutral">provider: none</Badge>
                    </div>
                  </div>
                  <p className="text-[11px] text-ink-400">Idempotency key: {shortIdempotencyKey(item.outbox.idempotency_key)}</p>
                  {item.outbox.last_error ? (
                    <p className="text-xs text-red-700">Last error: {item.outbox.last_error}</p>
                  ) : null}
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canManage || busy || !['queued', 'processing'].includes(item.outbox.status)}
                      onClick={() => void actions.fail.mutateAsync({
                        outboxId: item.outbox.id,
                        error: 'Manually marked failed from the queue UI; no provider attempted.',
                      }).catch((cause) => setError(getErrorMessage(cause)))}
                    >
                      Mark failed
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canManage || busy || item.outbox.status !== 'failed'}
                      onClick={() => void actions.retry.mutateAsync(item.outbox.id).catch((cause) => setError(getErrorMessage(cause)))}
                    >
                      Retry
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Suppression list</CardTitle>
            <CardDescription>Server-authoritative. Suppressed recipients are refused at submit, approval and queue time.</CardDescription>
          </CardHeader>
          <CardContent>
            {suppression.isLoading ? (
              <Skeleton className="h-20" />
            ) : suppression.isError ? (
              <ErrorState message={getErrorMessage(suppression.error)} onRetry={() => void suppression.refetch()} />
            ) : (suppression.data ?? []).length === 0 ? (
              <EmptyState title="No suppressions" description="Unsubscribes and bounces will appear here once recorded." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {(suppression.data ?? []).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-xs text-ink-600">
                    <span className="truncate">{item.email}</span>
                    <Badge variant={item.reason === 'unsubscribe' ? 'danger' : 'neutral'}>{item.reason}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add a suppression</CardTitle>
            <CardDescription>Owner or admin only. The server re-checks this role.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(event) => void handleSuppression(event)} className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-ink-700">Email address</span>
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@example.com" required />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-ink-700">Reason</span>
                  <Select value={reason} onChange={(event) => setReason(event.target.value as typeof reason)}>
                    {SUPPRESSION_REASONS.map((value) => <option key={value} value={value}>{value}</option>)}
                  </Select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-ink-700">Source (optional)</span>
                  <Input value={source} onChange={(event) => setSource(event.target.value)} placeholder="manual entry" />
                </label>
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm" variant="secondary" disabled={!canManage || addSuppression.isPending} loading={addSuppression.isPending}>
                  Add suppression
                </Button>
              </div>
              {!canManage ? <p className="text-xs text-ink-500">Your role cannot change suppressions.</p> : null}
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="py-4 text-xs leading-5 text-ink-500">
          Status labels describe stored queue state only. They are not delivery confirmations.
          {messageStatusLabel('sent')} rows would require a configured sender, which does not exist in this phase.
        </CardContent>
      </Card>
    </div>
  )
}
