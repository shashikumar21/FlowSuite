import { Link } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  MessageSquare,
  Send,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'
import {
  useBillingUsageReport,
  useBookingReport,
  useCrmReport,
  useInboxReport,
  useInvoicePaymentReports,
  useInvoiceReports,
  useSalesReport,
} from '../hooks'
import {
  buildInvoiceStatusBars,
  buildPaymentsReportSummary,
  EMPTY_BILLING_USAGE_REPORT,
  EMPTY_BOOKING_REPORT,
  EMPTY_CRM_REPORT,
  EMPTY_INBOX_REPORT,
  EMPTY_SALES_REPORT,
  reportBarWidth,
  toReportBars,
  type ReportBar,
} from '../utils'

function ReportBars({
  title,
  description,
  bars,
  loading,
  currency,
  barClassName = 'bg-brand-500',
}: {
  title: string
  description: string
  bars: ReportBar[]
  loading: boolean
  currency: string
  barClassName?: string
}) {
  const max = Math.max(0, ...bars.map((bar) => bar.value))
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-7" />)}</div>
        ) : bars.length ? (
          <ul className="space-y-4">
            {bars.map((bar) => (
              <li key={bar.key}>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium text-ink-800">{bar.label}</span>
                  <span className="shrink-0 tabular-nums text-ink-600">
                    {formatNumber(bar.value)}
                    {bar.secondary === undefined ? '' : ` · ${formatCurrency(bar.secondary, currency)}`}
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-ink-100"
                  role="img"
                  aria-label={`${bar.label}: ${bar.value}`}
                >
                  <div
                    className={`h-full rounded-full ${barClassName}`}
                    style={{ width: `${reportBarWidth(bar.value, max)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nothing to show yet" description="Figures appear here as this business records activity." />
        )}
      </CardContent>
    </Card>
  )
}

export function ReportsPage() {
  const { activeTenant, can, loading: tenantLoading } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const currency = activeTenant?.businesses?.currency ?? 'INR'
  const reportTenantId = can('view_reports') ? tenantId : undefined

  const crmQuery = useCrmReport(reportTenantId)
  const bookingQuery = useBookingReport(reportTenantId)
  const inboxQuery = useInboxReport(reportTenantId)
  const salesQuery = useSalesReport(reportTenantId)
  const usageQuery = useBillingUsageReport(reportTenantId)
  const invoicesQuery = useInvoiceReports(reportTenantId)
  const paymentsQuery = useInvoicePaymentReports(reportTenantId)

  const queries = [crmQuery, bookingQuery, inboxQuery, salesQuery, usageQuery, invoicesQuery, paymentsQuery]
  const failed = queries.filter((query) => query.isError)
  const isLoading = queries.some((query) => query.isLoading)

  if (tenantLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-28" />)}
        </div>
      </div>
    )
  }

  if (!can('view_reports')) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={<BarChart3 className="size-5" />}
            title="Reports aren't available for this role"
            description="Owners, admins and managers can view tenant reports. Ask a manager to share the figures you need."
          />
        </CardContent>
      </Card>
    )
  }

  const crm = crmQuery.data ?? EMPTY_CRM_REPORT
  const booking = bookingQuery.data ?? EMPTY_BOOKING_REPORT
  const inbox = inboxQuery.data ?? EMPTY_INBOX_REPORT
  const sales = salesQuery.data ?? EMPTY_SALES_REPORT
  const usage = usageQuery.data ?? EMPTY_BILLING_USAGE_REPORT
  const invoices = invoicesQuery.data ?? []
  const payments = paymentsQuery.data ?? []
  const paymentSummary = buildPaymentsReportSummary(invoices, payments)

  const stats: Array<{ label: string; value: string; icon: LucideIcon; tone: string }> = [
    { label: 'Total contacts', value: formatNumber(crm.total_contacts), icon: Users, tone: 'bg-brand-50 text-brand-600' },
    { label: 'Won deals', value: formatNumber(crm.won_deals), icon: Target, tone: 'bg-emerald-50 text-emerald-600' },
    { label: 'Open pipeline', value: formatCurrency(crm.open_pipeline_value, currency), icon: CircleDollarSign, tone: 'bg-indigo-50 text-indigo-600' },
    { label: 'Appointments this week', value: formatNumber(booking.week_count), icon: CalendarDays, tone: 'bg-blue-50 text-blue-600' },
    { label: 'Open conversations', value: formatNumber(inbox.open_count), icon: MessageSquare, tone: 'bg-amber-50 text-amber-600' },
    { label: 'Sales emails sent', value: formatNumber(sales.emails_sent), icon: Send, tone: 'bg-violet-50 text-violet-600' },
    { label: 'Payments collected', value: formatCurrency(paymentSummary.collected, currency), icon: CreditCard, tone: 'bg-teal-50 text-teal-600' },
    { label: 'Outstanding', value: formatCurrency(paymentSummary.outstanding, currency), icon: BarChart3, tone: 'bg-rose-50 text-rose-600' },
  ]

  const sourceBars = toReportBars(crm.leads_by_source.map((item) => ({ label: item.label, value: item.count })))
  const stageBars = toReportBars(
    crm.deals_by_stage.map((item) => ({ label: item.stage, value: item.count, secondary: item.value })),
  )
  const appointmentBars = toReportBars([
    { label: 'Completed', value: booking.completed_count },
    { label: 'Upcoming', value: booking.upcoming_count },
    { label: 'Pending', value: booking.pending_count },
    { label: 'No-show', value: booking.no_show_count },
    { label: 'Cancelled', value: booking.cancelled_count },
  ])
  const inboxBars = toReportBars([
    { label: 'Open', value: inbox.open_count },
    { label: 'Pending', value: inbox.pending_count },
    { label: 'Closed', value: inbox.closed_count },
    { label: 'Unassigned', value: inbox.unassigned_count },
  ])
  const salesBars = toReportBars([
    { label: 'Prospects', value: sales.total_prospects },
    { label: 'Verified contacts', value: sales.verified_contacts },
    { label: 'Emails sent', value: sales.emails_sent },
    { label: 'Replies received', value: sales.replies_received },
    { label: 'Converted customers', value: sales.converted_customers },
  ])
  const invoiceBars = buildInvoiceStatusBars(invoices)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Operations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Reports</h1>
          <p className="mt-1 text-sm text-ink-500">
            Live, tenant-scoped figures from CRM, bookings, conversations, sales and payments.
          </p>
        </div>
        <Badge variant="brand">Live</Badge>
      </div>

      {failed.length ? (
        <Card>
          <CardContent>
            <ErrorState
              message={getErrorMessage(failed[0]?.error)}
              onRetry={() => failed.forEach((query) => void query.refetch())}
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-ink-500">{label}</p>
                {isLoading ? (
                  <Skeleton className="mt-3 h-7 w-20" />
                ) : (
                  <p className="mt-2 text-2xl font-bold tracking-tight text-ink-900">{value}</p>
                )}
              </div>
              <span className={`flex size-9 items-center justify-center rounded-lg ${tone}`}>
                <Icon className="size-4" />
              </span>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ReportBars
          title="Leads by source"
          description="Where new enquiries came from."
          bars={sourceBars}
          loading={isLoading}
          currency={currency}
        />
        <ReportBars
          title="Pipeline by stage"
          description="Deal count and open value in each stage."
          bars={stageBars}
          loading={isLoading}
          currency={currency}
          barClassName="bg-indigo-500"
        />
        <ReportBars
          title="Appointments"
          description="Booking outcomes recorded for this business."
          bars={appointmentBars}
          loading={isLoading}
          currency={currency}
          barClassName="bg-blue-500"
        />
        <ReportBars
          title="Conversations"
          description="Current inbox workload."
          bars={inboxBars}
          loading={isLoading}
          currency={currency}
          barClassName="bg-amber-500"
        />
        <ReportBars
          title="Sales outreach"
          description="Prospects, outreach and replies from the AI sales agent."
          bars={salesBars}
          loading={isLoading}
          currency={currency}
          barClassName="bg-violet-500"
        />
        <ReportBars
          title="Invoices by status"
          description="Invoice count and billed value in each status."
          bars={invoiceBars}
          loading={isLoading}
          currency={currency}
          barClassName="bg-teal-500"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Platform usage</CardTitle>
          <CardDescription>
            Current billing period{usage.period_start ? ` starting ${formatDate(usage.period_start)}` : ''}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: 'Contacts', value: usage.contacts },
              { label: 'Employees', value: usage.employees },
              { label: 'Messages', value: usage.messages },
              { label: 'Workflow runs', value: usage.workflow_runs },
              { label: 'AI credits', value: usage.ai_credits },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-xs font-medium text-ink-500">{item.label}</dt>
                <dd className="mt-1 text-xl font-bold text-ink-900">
                  {isLoading ? <Skeleton className="h-6 w-12" /> : formatNumber(item.value)}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link to="/app/crm"><Button variant="outline" size="sm">CRM overview</Button></Link>
        <Link to="/app/appointments"><Button variant="outline" size="sm">Appointments</Button></Link>
        <Link to="/app/conversations"><Button variant="outline" size="sm">Conversations</Button></Link>
        <Link to="/app/sales-agent"><Button variant="outline" size="sm">Sales agent</Button></Link>
        <Link to="/app/payments"><Button variant="outline" size="sm">Payments</Button></Link>
      </div>
    </div>
  )
}
