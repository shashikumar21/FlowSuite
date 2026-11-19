import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { requireSupabase } from '@/integrations/supabase/client'
import { formatCurrency, formatNumber, titleCase } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'
import type { PlanRow } from '@/types/database'

function limitValue(limits: Record<string, unknown>, key: string): string {
  const value = limits[key]
  if (typeof value !== 'number') return '—'
  return value < 0 ? 'Unlimited' : formatNumber(value)
}

export function AdminPlansPage() {
  const query = useQuery({
    queryKey: ['admin-plans'],
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('admin_list_plans')
      if (error) throw error
      return data
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Platform</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">Plans & entitlements</h1>
        <p className="mt-1 text-sm text-ink-500">Illustrative India launch pricing. Limits are enforced server-side, never in React.</p>
      </div>

      {query.isError ? <Card><ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} /></Card> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {query.isLoading
          ? [0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-64" />)
          : query.data?.map((plan: PlanRow) => {
              const limits = plan.limits as Record<string, unknown>
              return (
                <Card key={plan.id}>
                  <CardHeader className="flex-row items-start justify-between">
                    <div>
                      <CardTitle>{plan.name}</CardTitle>
                      <CardDescription>{plan.description}</CardDescription>
                    </div>
                    <Badge variant={plan.active ? 'success' : 'neutral'}>{plan.active ? 'Active' : 'Inactive'}</Badge>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-ink-900">
                      {plan.price_monthly > 0 ? formatCurrency(plan.price_monthly) : 'Custom'}
                      <span className="ml-1 text-xs font-normal text-ink-400">/month</span>
                    </p>
                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      {['employees', 'contacts', 'messages', 'ai_credits', 'workflow_runs', 'branches'].map((key) => (
                        <div key={key} className="flex justify-between gap-2 border-b border-ink-100 pb-1.5">
                          <dt className="text-ink-500">{titleCase(key)}</dt>
                          <dd className="font-semibold text-ink-800">{limitValue(limits, key)}</dd>
                        </div>
                      ))}
                    </dl>
                  </CardContent>
                </Card>
              )
            })}
      </div>
    </div>
  )
}
