import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, Target } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, Skeleton } from '@/components/ui/Feedback'
import { formatCurrency, formatNumber } from '@/lib/format'
import type { DashboardLeadSource, DashboardPipelineStage } from '../schemas'

const PIE_COLORS = ['#6366f1', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6']

type DashboardChartsProps = {
  leadSources: DashboardLeadSource[]
  pipelineStages: DashboardPipelineStage[]
  loading: boolean
  currency: string
}

function ChartSkeleton() {
  return (
    <div className="h-56">
      <Skeleton className="h-full w-full" />
    </div>
  )
}

export function DashboardCharts({
  leadSources,
  pipelineStages,
  loading,
  currency,
}: DashboardChartsProps) {
  const visibleStages = pipelineStages.filter((stage) => stage.count > 0)
  const totalOpenDeals = visibleStages.reduce((total, stage) => total + stage.count, 0)
  const totalPipelineValue = visibleStages.reduce((total, stage) => total + stage.value, 0)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Leads by source</CardTitle>
          <CardDescription>Where this workspace's enquiries came from.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <ChartSkeleton />
          ) : leadSources.length ? (
            <>
              <div
                className="h-56"
                role="img"
                aria-label="Bar chart of leads grouped by source"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={leadSources}
                    layout="vertical"
                    margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
                  >
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={120}
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }} />
                    <Bar
                      dataKey="count"
                      name="Leads"
                      fill="#6366f1"
                      radius={[0, 6, 6, 0]}
                      barSize={18}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="sr-only">
                {leadSources.map((source) => (
                  <li key={source.label}>
                    {source.label}: {formatNumber(source.count)} leads
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState
              icon={<BarChart3 className="size-5" />}
              title="No lead sources yet"
              description="Source breakdown appears here once enquiries are recorded."
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline by stage</CardTitle>
          <CardDescription>
            Open deals by stage · {formatCurrency(totalPipelineValue, currency)} in play.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <ChartSkeleton />
          ) : visibleStages.length ? (
            <>
              <div
                className="relative h-56"
                role="img"
                aria-label="Donut chart of open deals by pipeline stage"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={visibleStages}
                      dataKey="count"
                      nameKey="stage"
                      cx="50%"
                      cy="46%"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {visibleStages.map((stage, index) => (
                        <Cell
                          key={`${stage.stage}-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-x-0 top-[38%] flex flex-col items-center">
                  <span className="text-2xl font-bold tracking-tight text-ink-900">
                    {formatNumber(totalOpenDeals)}
                  </span>
                  <span className="text-xs text-ink-500">open deals</span>
                </div>
              </div>
              <ul className="sr-only">
                {visibleStages.map((stage) => (
                  <li key={stage.stage}>
                    {stage.stage}: {formatNumber(stage.count)} deals,{' '}
                    {formatCurrency(stage.value, currency)}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState
              icon={<Target className="size-5" />}
              title="No deals in pipeline"
              description="Stage breakdown appears here once deals are added."
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
