import { useQuery } from '@tanstack/react-query'
import { Building2, CreditCard, IndianRupee, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { requireSupabase } from '@/integrations/supabase/client'
import { formatCurrency, formatNumber } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'

type Stats = {
  businesses_total: number
  businesses_active: number
  subscriptions_active: number
  mrr: number
  members_total: number
}

export function AdminOverviewPage() {
  const query = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('admin_platform_stats')
      if (error) throw error
      return (data ?? {}) as Stats
    },
  })

  const stats = query.data
  const cards = [
    { label: 'Businesses', value: stats ? formatNumber(stats.businesses_total) : null, sub: `${stats?.businesses_active ?? 0} active`, icon: Building2 },
    { label: 'Active subscriptions', value: stats ? formatNumber(stats.subscriptions_active) : null, sub: 'Across all tenants', icon: CreditCard },
    { label: 'Gross MRR', value: stats ? formatCurrency(Number(stats.mrr)) : null, sub: 'Before fees and usage', icon: IndianRupee },
    { label: 'Team members', value: stats ? formatNumber(stats.members_total) : null, sub: 'Active seats', icon: Users },
  ]

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Platform</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">Overview</h1>
        <p className="mt-1 text-sm text-ink-500">Aggregate platform metrics. Gross recurring revenue is before GST, fees and provider usage.</p>
      </div>

      {query.isError ? <Card><ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} /></Card> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, sub, icon: Icon }) => (
          <Card key={label} className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-ink-500">{label}</p>
                {query.isLoading ? <Skeleton className="mt-3 h-8 w-24" /> : <p className="mt-2 text-2xl font-bold tracking-tight text-ink-900">{value}</p>}
                <p className="mt-1 text-[11px] text-ink-400">{sub}</p>
              </div>
              <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Icon className="size-4" /></span>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="py-10 text-center text-sm text-ink-500">
          Usage, integration health and failed-job monitoring will appear here as those modules are added.
        </CardContent>
      </Card>
    </div>
  )
}
