import { requireSupabase } from '@/integrations/supabase/client'
import type { InvoicePaymentRow, InvoiceRow } from './types'
import type { InvoiceFormValues, PaymentFormValues } from './schemas'
import type { InvoiceContactOption } from './types'

export async function fetchInvoices(tenantId: string): Promise<InvoiceRow[]> {
  const { data, error } = await requireSupabase()
    .from('invoices')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('issue_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as InvoiceRow[]
}

export async function fetchInvoicePayments(tenantId: string): Promise<InvoicePaymentRow[]> {
  const { data, error } = await requireSupabase()
    .from('invoice_payments')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('paid_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as InvoicePaymentRow[]
}

export async function fetchInvoiceContacts(tenantId: string): Promise<InvoiceContactOption[]> {
  const { data, error } = await requireSupabase()
    .from('contacts')
    .select('id, first_name, last_name')
    .eq('tenant_id', tenantId)
    .is('archived_at', null)
    .order('first_name')
    .limit(200)
  if (error) throw error
  return ((data ?? []) as Array<{ id: string; first_name: string; last_name: string | null }>).map((c) => ({
    id: c.id,
    full_name: [c.first_name, c.last_name].filter(Boolean).join(' '),
  }))
}

export async function createInvoice(tenantId: string, values: InvoiceFormValues): Promise<string> {
  const { data, error } = await requireSupabase().rpc('payments_create_invoice', {
    p_tenant: tenantId,
    p_contact: values.contact_id || null,
    p_title: values.title,
    p_status: values.status === 'void' ? 'draft' : values.status,
    p_currency: values.currency || 'INR',
    p_issue_date: values.issue_date,
    p_due_date: values.due_date || null,
    p_line_items: values.line_items as unknown as never,
    p_tax_amount: Number(values.tax_amount || 0),
    p_discount_amount: Number(values.discount_amount || 0),
    p_notes: values.notes || null,
  })
  if (error) throw error
  return data as string
}

export async function updateInvoice(tenantId: string, invoiceId: string, values: InvoiceFormValues): Promise<void> {
  const { error } = await requireSupabase().rpc('payments_update_invoice', {
    p_tenant: tenantId,
    p_invoice: invoiceId,
    p_contact: values.contact_id || null,
    p_title: values.title,
    p_status: values.status,
    p_currency: values.currency || 'INR',
    p_issue_date: values.issue_date,
    p_due_date: values.due_date || null,
    p_line_items: values.line_items as unknown as never,
    p_tax_amount: Number(values.tax_amount || 0),
    p_discount_amount: Number(values.discount_amount || 0),
    p_notes: values.notes || null,
  })
  if (error) throw error
}

export async function recordInvoicePayment(tenantId: string, invoiceId: string, values: PaymentFormValues): Promise<string> {
  const { data, error } = await requireSupabase().rpc('payments_record_payment', {
    p_tenant: tenantId,
    p_invoice: invoiceId,
    p_amount: Number(values.amount),
    p_method: values.method,
    p_reference: values.reference || null,
    p_paid_at: values.paid_at ? new Date(values.paid_at).toISOString() : null,
    p_notes: values.notes || null,
  })
  if (error) throw error
  return data as string
}

export async function deleteInvoice(tenantId: string, invoiceId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('payments_delete_invoice', { p_tenant: tenantId, p_invoice: invoiceId })
  if (error) throw error
}
