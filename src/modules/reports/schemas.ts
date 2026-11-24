import { z } from 'zod'

const count = z.coerce.number()
const amount = z.coerce.number()

/** All metric RPCs are tenant-scoped on the server; these validate the shape. */
export const crmReportSchema = z.object({
  total_contacts: count,
  new_leads: count,
  qualified_leads: count,
  open_deals: count,
  won_deals: count,
  open_pipeline_value: amount,
  leads_by_source: z.array(z.object({ label: z.string(), count })),
  deals_by_stage: z.array(z.object({ stage: z.string(), count, value: amount })),
})

export const bookingReportSchema = z.object({
  today_count: count,
  upcoming_count: count,
  pending_count: count,
  completed_count: count,
  cancelled_count: count,
  no_show_count: count,
  week_count: count,
})

export const inboxReportSchema = z.object({
  open_count: count,
  pending_count: count,
  closed_count: count,
  unassigned_count: count,
})

export const salesReportSchema = z.object({
  total_prospects: count,
  new_prospects: count,
  verified_contacts: count,
  active_campaigns: count,
  emails_sent: count,
  replies_received: count,
  interested_prospects: count,
  converted_customers: count,
  saved_searches: count,
})

export const billingUsageReportSchema = z.object({
  contacts: count,
  employees: count,
  branches: count,
  messages: count,
  workflow_runs: count,
  ai_credits: count,
  period_start: z.string(),
})

export const invoiceReportSchema = z.object({
  id: z.string(),
  status: z.string(),
  total_amount: amount,
  amount_paid: amount,
  issue_date: z.string(),
})

export const invoicePaymentReportSchema = z.object({
  id: z.string(),
  invoice_id: z.string(),
  amount,
  paid_at: z.string(),
})

export type CrmReport = z.infer<typeof crmReportSchema>
export type BookingReport = z.infer<typeof bookingReportSchema>
export type InboxReport = z.infer<typeof inboxReportSchema>
export type SalesReport = z.infer<typeof salesReportSchema>
export type BillingUsageReport = z.infer<typeof billingUsageReportSchema>
export type InvoiceReport = z.infer<typeof invoiceReportSchema>
export type InvoicePaymentReport = z.infer<typeof invoicePaymentReportSchema>
