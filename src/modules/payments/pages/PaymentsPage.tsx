import { CreditCard, IndianRupee, Receipt, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/Feedback'

export function PaymentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Operations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Payments</h1>
          <p className="mt-1 text-sm text-ink-500">
            Track invoices and payments. Provider integration is not connected yet.
          </p>
        </div>
        <Badge variant="warning">Provider pending</Badge>
      </div>

      <Card className="border-amber-200 bg-amber-50/60">
        <CardContent className="flex items-start gap-3 py-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">No payment provider connected</p>
            <p className="mt-1 text-amber-800">
              This is a Payments shell. Real payment collection, invoices, refunds, and reconciliation require a provider
              integration (for example Razorpay), server-side secrets, webhooks, and compliance/billing setup. No real
              payments are collected from this screen.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-ink-500">Collected</p>
              <IndianRupee className="size-4 text-ink-400" />
            </div>
            <p className="mt-1 text-2xl font-bold text-ink-900">—</p>
            <p className="mt-1 text-xs text-ink-500">No provider data</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-ink-500">Pending</p>
              <CreditCard className="size-4 text-ink-400" />
            </div>
            <p className="mt-1 text-2xl font-bold text-ink-900">—</p>
            <p className="mt-1 text-xs text-ink-500">No provider data</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-ink-500">Invoices</p>
              <Receipt className="size-4 text-ink-400" />
            </div>
            <p className="mt-1 text-2xl font-bold text-ink-900">—</p>
            <p className="mt-1 text-xs text-ink-500">No provider data</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-900">Recent payments</h2>
            <Badge variant="neutral">Coming soon</Badge>
          </div>
          <EmptyState
            icon={<Receipt className="size-5" />}
            title="No payments yet"
            description="Once a payment provider is connected and approved, invoices and payment records will appear here."
          />
        </CardContent>
      </Card>
    </div>
  )
}
