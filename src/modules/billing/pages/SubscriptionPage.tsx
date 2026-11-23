import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, CreditCard, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { SUPPORT_EMAIL } from '@/integrations/supabase/client'
import { getErrorMessage } from '@/lib/errors'
import { formatCurrency, formatDate, titleCase } from '@/lib/format'
import { createRazorpayOrder, fetchBillingOverview, verifyRazorpayPayment } from '../api'
import { loadRazorpayCheckout, openRazorpayCheckout } from '../checkout'
import type { BillingCycle, PlanSummary } from '../types'

function enabledFeatures(plan: PlanSummary): string[] {
  return Object.entries(plan.features)
    .filter(([, value]) => value === true)
    .map(([key]) => key)
}

function limitLabel(limits: Record<string, unknown>, key: string): string {
  const value = limits[key]
  if (typeof value !== 'number') return '—'
  return value < 0 ? 'Unlimited' : new Intl.NumberFormat('en-IN').format(value)
}

export function SubscriptionPage() {
  const { activeTenantId } = useTenant()
  const { toast } = useToast()
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['billing-overview', activeTenantId],
    queryFn: () => fetchBillingOverview(activeTenantId ?? ''),
    enabled: Boolean(activeTenantId),
  })

  const startCheckout = async (plan: PlanSummary) => {
    if (!activeTenantId) return
    setBusyPlanId(plan.id)
    try {
      const order = await createRazorpayOrder({
        tenantId: activeTenantId,
        planId: plan.id,
        billingCycle: cycle,
      })
      const loaded = await loadRazorpayCheckout()
      if (!loaded) throw new Error('Could not load Razorpay Checkout. Check your connection and try again.')

      const opened = openRazorpayCheckout({
        keyId: order.key_id,
        amountPaise: order.amount_paise,
        currency: order.currency,
        orderId: order.order_id,
        name: 'FlowSuite',
        description: `${order.plan_name} · ${cycle === 'yearly' ? 'Yearly' : 'Monthly'}`,
        handler: (response) => {
          const paymentId = response.razorpay_payment_id
          const signature = response.razorpay_signature
          if (!paymentId || !signature) {
            toast({ title: 'Payment details incomplete', description: 'Please contact support with your payment reference.', variant: 'error' })
            return
          }
          void verifyRazorpayPayment({
            tenantId: activeTenantId,
            orderId: response.razorpay_order_id || order.order_id,
            paymentId,
            signature,
          }).then(() => {
            toast({ title: 'Subscription activated', description: `${order.plan_name} is now your active plan.` })
            void query.refetch()
          }).catch((error: unknown) => {
            toast({ title: 'Payment received, activation pending', description: getErrorMessage(error), variant: 'error' })
          })
        },
        onDismiss: () => toast({ title: 'Checkout closed', description: 'No payment was completed.', variant: 'info' }),
      })
      if (!opened) throw new Error('Razorpay Checkout could not be opened.')
    } catch (error) {
      toast({ title: 'Could not start checkout', description: getErrorMessage(error), variant: 'error' })
    } finally {
      setBusyPlanId(null)
    }
  }

  const overview = query.data
  const currentPlan = overview?.subscription?.plan ?? null

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Settings</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">Subscription</h1>
        <p className="mt-1 text-sm text-ink-500">
          Choose a plan and pay securely through Razorpay. FlowSuite never stores your card details.
        </p>
      </div>

      {query.isError ? (
        <Card><ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} /></Card>
      ) : null}

      {query.isLoading ? (
        <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
      ) : null}

      {overview ? (
        <>
          <Card>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>Current plan</CardTitle>
                <CardDescription>
                  {currentPlan
                    ? `Renews ${formatDate(overview.subscription?.period_end)}`
                    : 'No paid plan yet. You can keep using FlowSuite while entitlements are not enforced.'}
                </CardDescription>
              </div>
              {overview.subscription ? (
                <Badge variant={overview.subscription.status === 'active' ? 'success' : 'warning'}>
                  {titleCase(overview.subscription.status)}
                </Badge>
              ) : (
                <Badge variant="neutral">No plan</Badge>
              )}
            </CardHeader>
            {currentPlan ? (
              <CardContent>
                <p className="text-xl font-bold text-ink-900">{currentPlan.name}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {enabledFeatures(currentPlan).map((feature) => (
                    <span key={feature} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                      <Check className="size-3" /> {titleCase(feature)}
                    </span>
                  ))}
                </div>
              </CardContent>
            ) : null}
          </Card>

          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-ink-900">Available plans</h2>
              <p className="text-xs text-ink-500">Prices in Indian Rupees, inclusive of taxes as shown by Razorpay.</p>
            </div>
            <div className="inline-flex rounded-lg border border-ink-200 bg-white p-1">
              {(['monthly', 'yearly'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCycle(option)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${cycle === option ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50'}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {overview.plans.map((plan) => {
              const price = cycle === 'yearly' ? plan.price_yearly : plan.price_monthly
              const purchasable = price > 0
              return (
                <Card key={plan.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle>{plan.name}</CardTitle>
                      {currentPlan?.id === plan.id ? <Badge variant="brand">Current</Badge> : null}
                    </div>
                    <CardDescription>{plan.description ?? 'FlowSuite plan'}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    <p className="text-2xl font-bold text-ink-900">
                      {purchasable ? formatCurrency(price) : 'Custom'}
                      {purchasable ? <span className="ml-1 text-xs font-normal text-ink-400">/{cycle === 'yearly' ? 'year' : 'month'}</span> : null}
                    </p>
                    <dl className="mt-4 flex-1 space-y-1.5 text-xs">
                      {['contacts', 'employees', 'messages', 'ai_credits', 'workflow_runs', 'branches'].map((key) => (
                        <div key={key} className="flex justify-between gap-2 border-b border-ink-100 pb-1">
                          <dt className="text-ink-500">{titleCase(key)}</dt>
                          <dd className="font-semibold text-ink-800">{limitLabel(plan.limits, key)}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-4">
                      {purchasable ? (
                        <Button
                          className="w-full"
                          loading={busyPlanId === plan.id}
                          onClick={() => void startCheckout(plan)}
                        >
                          <CreditCard className="size-4" /> Choose {plan.name}
                        </Button>
                      ) : (
                        <Button
                          className="w-full"
                          variant="outline"
                          onClick={() => {
                            window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`FlowSuite ${plan.name} plan`)}`
                          }}
                        >
                          Contact sales
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>How billing works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-ink-600">
              <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" /> Payments are processed by Razorpay over HTTPS. Card details never touch FlowSuite servers.</p>
              <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" /> Your subscription activates only after a server-verified payment signature or a signed Razorpay webhook.</p>
              <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" /> Plan entitlements are visible here today. Hard feature blocking is not switched on yet.</p>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
