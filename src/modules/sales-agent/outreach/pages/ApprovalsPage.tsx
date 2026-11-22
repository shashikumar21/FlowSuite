import { ShieldCheck } from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { getErrorMessage } from '@/lib/errors'
import { useApprovals, useDraftViews, useSuppression } from '../hooks'
import { ApprovalRow } from '../components/ApprovalRow'
import { canReviewOutreach, isSuppressed } from '../utils'

export function ApprovalsPage() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const canReview = canReviewOutreach(activeTenant?.role)
  const drafts = useDraftViews(tenantId)
  const approvals = useApprovals(tenantId)
  const suppression = useSuppression(tenantId)

  if (!tenantId) return <ErrorState message="Select a business to review its outreach." />

  const all = drafts.data ?? []
  const pending = all.filter((item) => item.message.status === 'pending_approval')
  const messageMap = new Map(all.map((item) => [item.message.id, item]))
  const suppressionList = suppression.data ?? []

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Approval inbox</h1>
          <p className="mt-1 text-sm text-ink-500">
            Review each draft before it can be queued. Approval history is recorded server-side.
          </p>
        </div>
        <Badge variant={canReview ? 'success' : 'neutral'}>
          <ShieldCheck className="mr-1 size-3.5" /> {canReview ? 'You can approve' : 'View only'}
        </Badge>
      </header>

      {drafts.isLoading ? (
        <div className="space-y-4"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
      ) : drafts.isError ? (
        <ErrorState message={getErrorMessage(drafts.error)} onRetry={() => void drafts.refetch()} />
      ) : pending.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShieldCheck className="size-5" />}
            title="Nothing awaiting approval"
            description="Submit a draft from the AI Email Writer and it will appear here for review."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {pending.map((view) => (
            <ApprovalRow
              key={view.message.id}
              view={view}
              tenantId={tenantId}
              canReview={canReview}
              suppressed={isSuppressed(view.message.recipient_email ?? '', suppressionList)}
              history={(approvals.data ?? []).filter((item) => item.message_id === view.message.id)}
              onChanged={() => { void drafts.refetch(); void approvals.refetch() }}
            />
          ))}
        </div>
      )}

      <Card>
        <CardContent className="space-y-3 py-5">
          <p className="text-sm font-semibold text-ink-900">Approval history</p>
          {approvals.isError ? (
            <p className="text-sm text-red-700">{getErrorMessage(approvals.error)}</p>
          ) : (approvals.data ?? []).length === 0 ? (
            <p className="text-sm text-ink-500">No decisions recorded yet.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {(approvals.data ?? []).map((item) => {
                const view = messageMap.get(item.message_id)
                return (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-xs text-ink-600">
                    <span className="min-w-0 truncate">
                      {view?.prospect?.business_name ?? 'Unknown recipient'} · {view?.message.subject ?? 'Draft unavailable'}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant={item.decision === 'approved' ? 'success' : 'danger'}>{item.decision}</Badge>
                      <span>{new Date(item.created_at).toLocaleString()}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
