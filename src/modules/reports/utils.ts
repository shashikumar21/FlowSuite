import type {
  BillingUsageReport,
  BookingReport,
  CrmReport,
  InboxReport,
  InvoicePaymentReport,
  InvoiceReport,
  SalesReport,
} from './schemas'

export const EMPTY_CRM_REPORT: CrmReport = {
  total_contacts: 0,
  new_leads: 0,
  qualified_leads: 0,
  open_deals: 0,
  won_deals: 0,
  open_pipeline_value: 0,
  leads_by_source: [],
  deals_by_stage: [],
}

export const EMPTY_BOOKING_REPORT: BookingReport = {
  today_count: 0,
  upcoming_count: 0,
  pending_count: 0,
  completed_count: 0,
  cancelled_count: 0,
  no_show_count: 0,
  week_count: 0,
}

export const EMPTY_INBOX_REPORT: InboxReport = {
  open_count: 0,
  pending_count: 0,
  closed_count: 0,
  unassigned_count: 0,
}

export const EMPTY_SALES_REPORT: SalesReport = {
  total_prospects: 0,
  new_prospects: 0,
  verified_contacts: 0,
  active_campaigns: 0,
  emails_sent: 0,
  replies_received: 0,
  interested_prospects: 0,
  converted_customers: 0,
  saved_searches: 0,
}

export const EMPTY_BILLING_USAGE_REPORT: BillingUsageReport = {
  contacts: 0,
  employees: 0,
  branches: 0,
  messages: 0,
  workflow_runs: 0,
  ai_credits: 0,
  period_start: '',
}

export type ReportBar = {
  key: string
  label: string
  value: number
  secondary?: number
}

export function reportBarWidth(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)))
}

export function toReportBars(
  rows: Array<{ label: string; value: number; secondary?: number }>,
): ReportBar[] {
  return rows
    .map((row, index) => ({
      key: `${row.label}-${index}`,
      label: row.label,
      value: Number(row.value) || 0,
      secondary: row.secondary,
    }))
    .sort((a, b) => b.value - a.value)
}

export type PaymentsReportSummary = {
  collected: number
  outstanding: number
  invoiceCount: number
  paidInvoiceCount: number
}

export function buildPaymentsReportSummary(
  invoices: InvoiceReport[],
  payments: InvoicePaymentReport[],
): PaymentsReportSummary {
  const active = invoices.filter((invoice) => invoice.status !== 'void')
  return {
    collected: payments.reduce((total, payment) => total + payment.amount, 0),
    outstanding: active.reduce(
      (total, invoice) => total + Math.max(0, invoice.total_amount - invoice.amount_paid),
      0,
    ),
    invoiceCount: active.length,
    paidInvoiceCount: active.filter((invoice) => invoice.status === 'paid').length,
  }
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  void: 'Void',
}

export function buildInvoiceStatusBars(invoices: InvoiceReport[]): ReportBar[] {
  const grouped = new Map<string, { count: number; value: number }>()
  for (const invoice of invoices) {
    const label = INVOICE_STATUS_LABELS[invoice.status] ?? 'Other'
    const current = grouped.get(label) ?? { count: 0, value: 0 }
    current.count += 1
    current.value += invoice.total_amount
    grouped.set(label, current)
  }
  return toReportBars(
    Array.from(grouped, ([label, group]) => ({
      label,
      value: group.count,
      secondary: group.value,
    })),
  )
}
