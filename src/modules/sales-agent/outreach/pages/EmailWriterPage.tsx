import { Link, useSearchParams } from 'react-router-dom'
import { PenLine } from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { getErrorMessage } from '@/lib/errors'
import { useDecisionMakerOptions, useDraftViews, useSuppression } from '../hooks'
import { DraftEditor } from '../components/DraftEditor'
import { isUnwrittenDraft, messageStatusLabel } from '../utils'

export function EmailWriterPage() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const [searchParams, setSearchParams] = useSearchParams()
  const campaignId = searchParams.get('campaign') ?? ''
  const messageId = searchParams.get('message') ?? ''
  const drafts = useDraftViews(tenantId)
  const decisionMakers = useDecisionMakerOptions(tenantId)
  const suppression = useSuppression(tenantId)

  if (!tenantId) return <ErrorState message="Select a business to write emails for." />

  const all = drafts.data ?? []
  const filtered = campaignId ? all.filter((item) => item.message.campaign_id === campaignId) : all
  const selected = filtered.find((item) => item.message.id === messageId) ?? filtered[0] ?? null

  function select(id: string) {
    const next = new URLSearchParams(searchParams)
    next.set('message', id)
    setSearchParams(next)
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">AI Email Writer</h1>
        <p className="mt-1 text-sm text-ink-500">
          Generate and edit a draft for one recipient at a time. Generated text is clearly marked and is never sent automatically.
        </p>
      </header>

      {drafts.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>
      ) : drafts.isError ? (
        <ErrorState message={getErrorMessage(drafts.error)} onRetry={() => void drafts.refetch()} />
      ) : all.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PenLine className="size-5" />}
            title="No drafts to write yet"
            description="Drafts are created when you add recipients to a campaign. No content is invented before then."
            action={<Link to="/app/sales-agent/campaigns" className="text-sm font-semibold text-brand-600 hover:text-brand-700">Go to campaigns →</Link>}
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            title="No drafts in this campaign"
            description="This campaign has no draft recipients. Select another campaign or create one."
            action={<Link to="/app/sales-agent/campaigns" className="text-sm font-semibold text-brand-600 hover:text-brand-700">View all campaigns →</Link>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="h-fit">
            <CardContent className="space-y-1 p-3">
              {campaignId ? (
                <Link to="/app/sales-agent/email-writer" className="mb-2 block px-2 text-xs font-semibold text-brand-600 hover:text-brand-700">
                  ← All campaigns
                </Link>
              ) : null}
              {filtered.map((item) => (
                <button
                  key={item.message.id}
                  type="button"
                  onClick={() => select(item.message.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                    item.message.id === selected?.message.id ? 'bg-brand-50' : 'hover:bg-ink-50'
                  }`}
                >
                  <span className="block truncate font-medium text-ink-900">
                    {item.prospect?.business_name ?? 'Unknown prospect'}
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <Badge variant={item.message.status === 'approved' ? 'success' : item.message.status === 'rejected' ? 'danger' : 'neutral'}>
                      {messageStatusLabel(item.message.status)}
                    </Badge>
                    {isUnwrittenDraft(item.message.body) ? (
                      <span className="text-[10px] text-ink-400">unwritten</span>
                    ) : null}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-5">
              {selected ? (
                <DraftEditor
                  key={selected.message.id}
                  view={selected}
                  tenantId={tenantId}
                  decisionMakers={decisionMakers.data ?? []}
                  suppression={suppression.data ?? []}
                  onChanged={() => void drafts.refetch()}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="py-4 text-xs leading-5 text-ink-500">
          No email provider is configured. Drafts and submissions are stored in the database only; nothing is delivered.
        </CardContent>
      </Card>
    </div>
  )
}
