import { z } from 'zod'
import { requireSupabase } from '@/integrations/supabase/client'
import {
  billingUsageReportSchema,
  bookingReportSchema,
  crmReportSchema,
  inboxReportSchema,
  invoicePaymentReportSchema,
  invoiceReportSchema,
  salesReportSchema,
  type BillingUsageReport,
  type BookingReport,
  type CrmReport,
  type InboxReport,
  type InvoicePaymentReport,
  type InvoiceReport,
  type SalesReport,
} from './schemas'
import {
  EMPTY_BILLING_USAGE_REPORT,
  EMPTY_BOOKING_REPORT,
  EMPTY_CRM_REPORT,
  EMPTY_INBOX_REPORT,
  EMPTY_SALES_REPORT,
} from './utils'

export async function fetchCrmReport(tenantId: string): Promise<CrmReport> {
  const { data, error } = await requireSupabase().rpc('crm_dashboard_metrics', { p_tenant: tenantId })
  if (error) throw error
  return crmReportSchema.parse({ ...EMPTY_CRM_REPORT, ...(data ?? {}) })
}

export async function fetchBookingReport(tenantId: string): Promise<BookingReport> {
  const { data, error } = await requireSupabase().rpc('booking_dashboard_metrics', {
    p_tenant: tenantId,
  })
  if (error) throw error
  return bookingReportSchema.parse({ ...EMPTY_BOOKING_REPORT, ...(data ?? {}) })
}

export async function fetchInboxReport(tenantId: string): Promise<InboxReport> {
  const { data, error } = await requireSupabase().rpc('inbox_metrics', { p_tenant: tenantId })
  if (error) throw error
  return inboxReportSchema.parse({ ...EMPTY_INBOX_REPORT, ...(data ?? {}) })
}

export async function fetchSalesReport(tenantId: string): Promise<SalesReport> {
  const { data, error } = await requireSupabase().rpc('sales_dashboard_metrics', {
    p_tenant: tenantId,
  })
  if (error) throw error
  return salesReportSchema.parse({ ...EMPTY_SALES_REPORT, ...(data ?? {}) })
}

export async function fetchBillingUsageReport(tenantId: string): Promise<BillingUsageReport> {
  const { data, error } = await requireSupabase().rpc('billing_get_usage', { p_tenant: tenantId })
  if (error) throw error
  const payload = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  return billingUsageReportSchema.parse({ ...EMPTY_BILLING_USAGE_REPORT, ...payload })
}

/** RLS plus the explicit tenant filter keep invoice rows tenant-scoped. */
export async function fetchInvoiceReports(tenantId: string): Promise<InvoiceReport[]> {
  const { data, error } = await requireSupabase()
    .from('invoices')
    .select('id, status, total_amount, amount_paid, issue_date')
    .eq('tenant_id', tenantId)
    .order('issue_date', { ascending: false })
    .limit(500)
  if (error) throw error
  return z.array(invoiceReportSchema).parse(data ?? [])
}

/** RLS plus the explicit tenant filter keep payment rows tenant-scoped. */
export async function fetchInvoicePaymentReports(tenantId: string): Promise<InvoicePaymentReport[]> {
  const { data, error } = await requireSupabase()
    .from('invoice_payments')
    .select('id, invoice_id, amount, paid_at')
    .eq('tenant_id', tenantId)
    .order('paid_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return z.array(invoicePaymentReportSchema).parse(data ?? [])
}
