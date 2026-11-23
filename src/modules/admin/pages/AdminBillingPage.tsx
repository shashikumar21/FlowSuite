import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CreditCard, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { FieldError, Input, Label, Select } from '@/components/ui/Input'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { useToast } from '@/app/providers/ToastProvider'
import { requireSupabase } from '@/integrations/supabase/client'
import { getErrorMessage } from '@/lib/errors'
import { formatDate, formatNumber, titleCase } from '@/lib/format'
import {
  assignTenantPlan,
  fetchBillingSettings,
  fetchBillingUsage,
  setBillingEnforcement,
} from '@/modules/billing/api'

export function AdminBillingPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [tenantId, setTenantId] = useState('')
  const [planId, setPlanId] = useState('')
  const [reason, setReason] = useState('')

  const businessesQuery = useQuery({
    queryKey: ['admin-businesses'],
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('admin_list_businesses')
      if (error) throw error
      return data
    },
  })

  const plansQuery = useQuery({
    queryKey: ['admin-plans'],
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('admin_list_plans')
      if (error) throw error
      return data
    },
  })

  const settingsQuery = useQuery({
    queryKey: ['admin-billing-settings'],
    queryFn: fetchBillingSettings,
  })

  const businesses = businessesQuery.data ?? []
  const plans = plansQuery.data ?? []
  const selectedTenantId = tenantId || businesses[0]?.id || ''
  const selectedPlanId = planId || plans.find((plan) => plan.active)?.id || ''

  const usageQuery = useQuery({
    queryKey: ['admin-billing-usage', selectedTenantId],
    queryFn: () => fetchBillingUsage(selectedTenantId),
    enabled: Boolean(selectedTenantId),
  })

  const assignMutation = useMutation({
    mutationFn: () => assignTenantPlan({
      tenantId: selectedTenantId,
      planId: selectedPlanId,
      reason: reason.trim() || null,
    }),
    onSuccess: async () => {
      toast({ title: 'Plan assigned', description: 'The business now has an active manual plan.' })
      setReason('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-businesses'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-billing-usage', selectedTenantId] }),
      ])
    },
    onError: (error) => toast({ title: 'Could not assign plan', description: getErrorMessage(error), variant: 'error' }),
  })

  const enforcementMutation = useMutation({
    mutationFn: setBillingEnforcement,
    onSuccess: (settings) => {
      queryClient.setQueryData(['admin-billing-settings'], settings)
      toast({
        title: settings.enforce_limits ? 'Limit enforcement enabled' : 'Limit enforcement disabled',
        description: settings.enforce_limits
          ? 'Plan limits now block metered writes for all tenants.'
          : 'Plan limits are advisory again.',
        variant: settings.enforce_limits ? 'info' : 'success',
      })
    },
    onError: (error) => toast({ title: 'Could not update enforcement', description: getErrorMessage(error), variant: 'error' }),
  })

  const toggleEnforcement = () => {
    const settings = settingsQuery.data
    if (!settings) return
    if (!settings.enforce_limits) {
      const confirmed = window.confirm(
        'Enable hard limit enforcement? New contacts, messages, workflow runs, branches and AI usage will be blocked when a tenant reaches its plan limit.',
      )
      if (!confirmed) return
    }
    enforcementMutation.mutate(!settings.enforce_limits)
  }

  const loadError = businessesQuery.isError || plansQuery.isError || settingsQuery.isError

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Platform</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">Billing control</h1>
        <p className="mt-1 text-sm text-ink-500">
          Assign plans without payment, inspect live usage and control server-side limit enforcement.
        </p>
      </div>

      {loadError ? (
        <Card>
          <ErrorState
            message={getErrorMessage(businessesQuery.error ?? plansQuery.error ?? settingsQuery.error)}
            onRetry={() => {
              void businessesQuery.refetch()
              void plansQuery.refetch()
              void settingsQuery.refetch()
            }}
          />
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CreditCard className="size-4" /> Manual plan assignment</CardTitle>
            <CardDescription>Records an active plan with provider “manual”. Use this for trials, partners and support fixes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {businessesQuery.isLoading || plansQuery.isLoading ? (
              <Skeleton className="h-40" />
            ) : businesses.length === 0 || plans.length === 0 ? (
              <EmptyState title="Nothing to assign yet" description="Create a business and a plan before assigning one." />
            ) : (
              <>
                <div>
                  <Label htmlFor="admin-billing-tenant">Business</Label>
                  <Select id="admin-billing-tenant" value={selectedTenantId} onChange={(event) => setTenantId(event.target.value)}>
                    {businesses.map((business) => (
                      <option key={business.id} value={business.id}>
                        {business.name} · {business.plan_name ?? 'No plan'}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="admin-billing-plan">Plan</Label>
                  <Select id="admin-billing-plan" value={selectedPlanId} onChange={(event) => setPlanId(event.target.value)}>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id} disabled={!plan.active}>
                        {plan.name} · {plan.price_monthly > 0 ? `₹${formatNumber(plan.price_monthly)}/mo` : 'Custom'}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="admin-billing-reason">Reason (optional)</Label>
                  <Input
                    id="admin-billing-reason"
                    value={reason}
                    maxLength={500}
                    placeholder="e.g. founding customer, support credit"
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <FieldError>{assignMutation.isError ? getErrorMessage(assignMutation.error) : undefined}</FieldError>
                </div>
                <Button
                  loading={assignMutation.isPending}
                  disabled={!selectedTenantId || !selectedPlanId}
                  onClick={() => assignMutation.mutate()}
                >
                  Assign plan
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" /> Server-side enforcement</CardTitle>
            <CardDescription>
              Off by default. When enabled, the database rejects metered inserts beyond the active plan limit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settingsQuery.isLoading ? (
              <Skeleton className="h-20" />
            ) : settingsQuery.data ? (
              <>
                <div className="flex items-center justify-between rounded-lg border border-ink-200 bg-ink-50 p-3">
                  <div>
                    <p className="text-sm font-semibold text-ink-900">Hard limits</p>
                    <p className="text-xs text-ink-500">
                      {settingsQuery.data.updated_at
                        ? `Last changed ${formatDate(settingsQuery.data.updated_at)}`
                        : 'Never changed'}
                    </p>
                  </div>
                  <Badge variant={settingsQuery.data.enforce_limits ? 'warning' : 'neutral'}>
                    {settingsQuery.data.enforce_limits ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <Button
                  variant={settingsQuery.data.enforce_limits ? 'outline' : 'danger'}
                  loading={enforcementMutation.isPending}
                  onClick={toggleEnforcement}
                >
                  {settingsQuery.data.enforce_limits ? 'Disable enforcement' : 'Enable enforcement'}
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>Live usage</CardTitle>
            <CardDescription>Counts are read from tenant tables, scoped by database policies.</CardDescription>
          </div>
          {settingsQuery.data?.enforce_limits ? <Badge variant="warning">Enforced</Badge> : <Badge variant="neutral">Advisory</Badge>}
        </CardHeader>
        <CardContent>
          {!selectedTenantId ? (
            <EmptyState title="No business selected" />
          ) : usageQuery.isError ? (
            <ErrorState message={getErrorMessage(usageQuery.error)} onRetry={() => void usageQuery.refetch()} />
          ) : usageQuery.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
          ) : usageQuery.data ? (
            <dl className="grid gap-3 sm:grid-cols-3">
              {(Object.entries(usageQuery.data) as Array<[string, number | string]>).map(([key, value]) => (
                <div key={key} className="rounded-lg border border-ink-200 bg-white p-3">
                  <dt className="text-xs text-ink-500">{titleCase(key)}</dt>
                  <dd className="mt-1 text-lg font-bold text-ink-900">
                    {typeof value === 'number' ? formatNumber(value) : formatDate(value)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
