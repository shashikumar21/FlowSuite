import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Mail,
  MessageSquare,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { getErrorMessage } from '@/lib/errors'
import { formatNumber } from '@/lib/format'
import { useSalesMetrics } from '../hooks'
import { ProviderStatus } from '../components/ProviderStatus'

const PLANNED = [
  { label: 'Decision makers', phase: 'Phase 4', detail: 'Research and store contacts within each prospect.' },
  { label: 'AI email writer', phase: 'Phase 3', detail: 'Draft subject lines and bodies from saved context.' },
  { label: 'Campaigns & approvals', phase: 'Phase 3', detail: 'Manual approval before any message can be queued.' },
  { label: 'Reply handling', phase: 'Phase 4', detail: 'Ingest replies so follow-up can be tracked on qualified prospects.' },
] as const

export function SalesAgentOverviewPage() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const metricsQuery = useSalesMetrics(tenantId)

  if (!tenantId) {
    return <ErrorState message="Select a business to view its sales agent data." />
  }

  const metrics = metricsQuery.data
  const cards = [
    { label: 'Total prospects', value: metrics?.total_prospects ?? 0, icon: Building2 },
    { label: 'New prospects', value: metrics?.new_prospects ?? 0, icon: Sparkles },
    { label: 'Verified contacts', value: metrics?.verified_contacts ?? 0, icon: ShieldCheck },
    { label: 'Saved searches', value: metrics?.saved_searches ?? 0, icon: Search },
    { label: 'Active campaigns', value: metrics?.active_campaigns ?? 0, icon: Send },
    { label: 'Emails sent', value: metrics?.emails_sent ?? 0, icon: Mail },
    { label: 'Replies received', value: metrics?.replies_received ?? 0, icon: MessageSquare },
    { label: 'Interested prospects', value: metrics?.interested_prospects ?? 0, icon: Target },
    { label: 'Converted customers', value: metrics?.converted_customers ?? 0, icon: CheckCircle2 },
  ]

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-ink-900">AI Sales Agent</h1>
            <Badge variant="brand">NEW</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            Find and organise prospects in one place. Everything below is scoped to this business.
          </p>
        </div>
        <Link
          to="/app/sales-agent/prospects"
          className="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-lg border border-ink-300 bg-white px-3 text-xs font-semibold text-ink-800 hover:bg-ink-50"
        >
          <Users className="size-4" /> Open prospects <ArrowRight className="size-4" />
        </Link>
      </header>

      {metricsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index}><CardContent className="py-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : metricsQuery.isError ? (
        <ErrorState
          message={getErrorMessage(metricsQuery.error)}
          onRetry={() => void metricsQuery.refetch()}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <Card key={card.label}>
                <CardContent className="flex items-center justify-between gap-3 py-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{card.label}</p>
                    <p className="mt-1 text-2xl font-bold text-ink-900">{formatNumber(card.value)}</p>
                  </div>
                  <span className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Icon className="size-5" />
                  </span>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ProviderStatus />

        <Card>
          <CardHeader>
            <CardTitle>Working now</CardTitle>
            <CardDescription>Available in this phase, with no external providers required.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              to="/app/sales-agent/discovery"
              className="flex items-center justify-between rounded-lg border border-ink-200 p-3 text-sm hover:bg-ink-50"
            >
              <span>
                <span className="block font-semibold text-ink-900">Prospect discovery</span>
                <span className="block text-xs text-ink-500">Save manual search criteria.</span>
              </span>
              <ArrowRight className="size-4 text-ink-400" />
            </Link>
            <Link
              to="/app/sales-agent/prospects"
              className="flex items-center justify-between rounded-lg border border-ink-200 p-3 text-sm hover:bg-ink-50"
            >
              <span>
                <span className="block font-semibold text-ink-900">Prospects</span>
                <span className="block text-xs text-ink-500">Add, edit, import and track prospects.</span>
              </span>
              <ArrowRight className="size-4 text-ink-400" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Planned next</CardTitle>
          <CardDescription>Not available yet. No data is shown for these areas.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {PLANNED.map((item) => (
            <div key={item.label} className="rounded-lg border border-ink-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink-900">{item.label}</p>
                <Badge variant="neutral">{item.phase}</Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-ink-500">{item.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
