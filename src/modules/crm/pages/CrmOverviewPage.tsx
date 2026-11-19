import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CircleDollarSign,
  Target,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { ActivityIcon } from '../components/StatusBadges'
import { fetchMetrics } from '../api'
import { crmKeys } from '../hooks'
import { activityLabel, barWidth, EMPTY_METRICS } from '../utils'
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'

export function CrmOverviewPage() {
  const { activeTenant, can } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const currency = activeTenant?.businesses?.currency ?? 'INR'

  const metricsQuery = useQuery({
    queryKey: crmKeys.metrics(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchMetrics(tenantId as string),
  })

  const data = metricsQuery.data ?? EMPTY_METRICS
  const stats = [
    { label: 'Total contacts', value: data.total_contacts, icon: Users, tone: 'bg-brand-50 text-brand-600' },
    { label: 'New leads', value: data.new_leads, icon: UserPlus, tone: 'bg-blue-50 text-blue-600' },
    { label: 'Qualified leads', value: data.qualified_leads, icon: UserCheck, tone: 'bg-amber-50 text-amber-600' },
    { label: 'Open deals', value: data.open_deals, icon: Target, tone: 'bg-indigo-50 text-indigo-600' },
    { label: 'Won deals', value: data.won_deals, icon: TrendingUp, tone: 'bg-emerald-50 text-emerald-600' },
    { label: 'Open pipeline value', value: formatCurrency(Number(data.open_pipeline_value), currency), icon: CircleDollarSign, tone: 'bg-teal-50 text-teal-600' },
  ]
  const maxSource = Math.max(0, ...data.leads_by_source.map((item) => Number(item.count)))
  const maxStage = Math.max(0, ...data.deals_by_stage.map((item) => Number(item.count)))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Customers</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">CRM overview</h1>
          <p className="mt-1 text-sm text-ink-500">
            Live figures from this business only, scoped to the records you are allowed to see.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/contacts"><Button variant="outline" size="sm">View contacts <ArrowRight className="size-3.5" /></Button></Link>
          <Link to="/app/deals"><Button size="sm">Open pipeline <ArrowRight className="size-3.5" /></Button></Link>
        </div>
      </div>

      {metricsQuery.isError ? (
        <Card><CardContent><ErrorState message={getErrorMessage(metricsQuery.error)} onRetry={() => void metricsQuery.refetch()} /></CardContent></Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-ink-500">{label}</p>
                {metricsQuery.isLoading ? (
                  <Skeleton className="mt-3 h-7 w-20" />
                ) : (
                  <p className="mt-2 text-2xl font-bold tracking-tight text-ink-900">
                    {typeof value === 'number' ? formatNumber(value) : value}
                  </p>
                )}
              </div>
              <span className={`flex size-9 items-center justify-center rounded-lg ${tone}`}><Icon className="size-4" /></span>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Leads by source</CardTitle>
            <CardDescription>How new enquiries reached this business.</CardDescription>
          </CardHeader>
          <CardContent>
            {metricsQuery.isLoading ? (
              <div className="space-y-3">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-7" />)}</div>
            ) : data.leads_by_source.length ? (
              <ul className="space-y-4">
                {data.leads_by_source.map((item) => (
                  <li key={item.label}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="font-medium text-ink-800">{item.label}</span>
                      <span className="tabular-nums text-ink-600">{formatNumber(Number(item.count))}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100" role="img" aria-label={`${item.label}: ${item.count} leads`}>
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${barWidth(Number(item.count), maxSource)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No lead sources yet" description="Sources appear here once leads are added." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deals by stage</CardTitle>
            <CardDescription>Count and value of deals in each pipeline stage.</CardDescription>
          </CardHeader>
          <CardContent>
            {metricsQuery.isLoading ? (
              <div className="space-y-3">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-7" />)}</div>
            ) : data.deals_by_stage.length ? (
              <ul className="space-y-4">
                {data.deals_by_stage.map((item) => (
                  <li key={item.stage}>
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium text-ink-800">{item.stage}</span>
                      <span className="shrink-0 tabular-nums text-ink-600">
                        {formatNumber(Number(item.count))} · {formatCurrency(Number(item.value), currency)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100" role="img" aria-label={`${item.stage}: ${item.count} deals`}>
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${barWidth(Number(item.count), maxStage)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No stages configured" description="A manager can add pipeline stages in CRM setup." />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest visible notes, calls and deal changes.</CardDescription>
          </div>
          <Badge variant="brand">Live</Badge>
        </CardHeader>
        <CardContent className="px-0 py-0">
          {metricsQuery.isLoading ? (
            <div className="space-y-3 p-5">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-10" />)}</div>
          ) : data.recent_activities.length ? (
            <ul className="divide-y divide-ink-100">
              {data.recent_activities.map((activity) => (
                <li key={activity.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600">
                    <ActivityIcon type={activity.type} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{activity.subject ?? activityLabel(activity.type)}</p>
                    <p className="text-xs text-ink-500">{activityLabel(activity.type)} · {formatDateTime(activity.occurred_at)}</p>
                    {activity.body ? <p className="mt-1 line-clamp-2 text-xs text-ink-600">{activity.body}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No activity yet" description="Log interactions on contacts to build this timeline." />
          )}
        </CardContent>
      </Card>

      {can('manage_pipeline') ? (
        <p className="text-xs text-ink-500">
          Need to add a pipeline, stage, lead source or tag? <Link className="font-semibold text-brand-600 hover:text-brand-700" to="/app/crm/settings">Open CRM setup →</Link>
        </p>
      ) : null}
    </div>
  )
}
