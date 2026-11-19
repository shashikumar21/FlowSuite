import { useQuery } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { requireSupabase } from '@/integrations/supabase/client'
import { formatDate, formatNumber } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'

type BusinessRow = {
  id: string
  name: string
  slug: string
  industry: string
  status: string
  plan_name: string | null
  subscription_status: string | null
  member_count: number
  created_at: string
}

export function AdminBusinessesPage() {
  const query = useQuery({
    queryKey: ['admin-businesses'],
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('admin_list_businesses')
      if (error) throw error
      return data
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Platform</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">Businesses</h1>
        <p className="mt-1 text-sm text-ink-500">Every tenant on the platform, with its plan and seat count.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All businesses</CardTitle>
          <CardDescription>Read-only in this milestone. Subscription changes will be added with Razorpay billing.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 py-0">
          {query.isLoading ? (
            <div className="space-y-3 p-5">{[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-12" />)}</div>
          ) : query.isError ? (
            <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
          ) : query.data?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-ink-50 text-left text-xs uppercase tracking-wider text-ink-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Business</th>
                    <th className="px-5 py-3 font-semibold">Industry</th>
                    <th className="px-5 py-3 font-semibold">Plan</th>
                    <th className="px-5 py-3 font-semibold">Seats</th>
                    <th className="px-5 py-3 font-semibold">Created</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {query.data.map((business: BusinessRow) => (
                    <tr key={business.id} className="hover:bg-ink-50/60">
                      <td className="px-5 py-3">
                        <p className="font-medium text-ink-900">{business.name}</p>
                        <p className="text-xs text-ink-400">{business.slug}</p>
                      </td>
                      <td className="px-5 py-3 text-ink-600">{business.industry}</td>
                      <td className="px-5 py-3">
                        <span className="text-ink-800">{business.plan_name ?? 'No plan'}</span>
                        {business.subscription_status ? (
                          <span className="ml-2 text-xs text-ink-400">{business.subscription_status}</span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 text-ink-600">{formatNumber(business.member_count)}</td>
                      <td className="px-5 py-3 text-ink-600">{formatDate(business.created_at)}</td>
                      <td className="px-5 py-3">
                        <Badge variant={business.status === 'active' ? 'success' : 'warning'}>{business.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={<Building2 className="size-5" />} title="No businesses yet" description="New tenants will appear here as they sign up." />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
