import { useMemo, useState } from 'react'
import { Eye, IndianRupee, Plus, Printer, Receipt, ShieldAlert, Trash2 } from 'lucide-react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { useInvoiceContacts, useInvoicePayments, useInvoices, usePaymentMutations } from '../hooks'
import { computeTotals, invoiceFormSchema, invoicePaymentMethods, paymentFormSchema, type InvoiceFormValues, type PaymentFormValues } from '../schemas'
import type { InvoiceRow } from '../types'

const statusVariant: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral', sent: 'warning', partially_paid: 'warning', paid: 'success', void: 'danger',
}
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

function toDateInput(v: string | null | undefined) {
  if (!v) return ''
  return v.slice(0, 10)
}

export function PaymentsPage() {
  const { activeTenant } = useTenant()
  const { toast } = useToast()
  const tenantId = activeTenant?.tenant_id
  const invoices = useInvoices(tenantId)
  const payments = useInvoicePayments(tenantId)
  const contacts = useInvoiceContacts(tenantId)
  const mutations = usePaymentMutations(tenantId)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [editing, setEditing] = useState<InvoiceRow | null>(null)
  const [paymentInvoice, setPaymentInvoice] = useState<InvoiceRow | null>(null)
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceRow | null>(null)

  const invoiceForm = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema) as any,
    defaultValues: { contact_id: '', title: '', status: 'draft', currency: 'INR', issue_date: new Date().toISOString().slice(0, 10), due_date: '', line_items: [{ description: '', quantity: 1, unit_price: 0 }], tax_amount: 0, discount_amount: 0, notes: '' },
  })
  const { fields, append, remove } = useFieldArray({ control: invoiceForm.control, name: 'line_items' })
  const watchedItems = useWatch({ control: invoiceForm.control, name: 'line_items' }) ?? []
  const watchedTax = useWatch({ control: invoiceForm.control, name: 'tax_amount' }) ?? 0
  const watchedDiscount = useWatch({ control: invoiceForm.control, name: 'discount_amount' }) ?? 0
  const totals = useMemo(() => computeTotals(watchedItems as any, Number(watchedTax), Number(watchedDiscount)), [watchedItems, watchedTax, watchedDiscount])

  const paymentForm = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema) as any,
    defaultValues: { amount: 0, method: 'upi', reference: '', paid_at: '', notes: '' },
  })

  const openCreate = () => {
    setEditing(null)
    invoiceForm.reset({ contact_id: '', title: '', status: 'draft', currency: 'INR', issue_date: new Date().toISOString().slice(0, 10), due_date: '', line_items: [{ description: '', quantity: 1, unit_price: 0 }], tax_amount: 0, discount_amount: 0, notes: '' })
    setInvoiceOpen(true)
  }
  const openEdit = (inv: InvoiceRow) => {
    setEditing(inv)
    const items = Array.isArray(inv.line_items) ? inv.line_items as any[] : []
    invoiceForm.reset({
      contact_id: inv.contact_id ?? '', title: inv.title, status: (inv.status === 'partially_paid' || inv.status === 'paid') ? 'sent' : inv.status as any,
      currency: inv.currency || 'INR', issue_date: toDateInput(inv.issue_date), due_date: toDateInput(inv.due_date),
      line_items: items.length ? items.map(i => ({ description: String(i.description ?? ''), quantity: Number(i.quantity ?? 1), unit_price: Number(i.unit_price ?? 0) })) : [{ description: '', quantity: 1, unit_price: 0 }],
      tax_amount: Number(inv.tax_amount ?? 0), discount_amount: Number(inv.discount_amount ?? 0), notes: inv.notes ?? '',
    })
    setInvoiceOpen(true)
  }
  const openPayment = (inv: InvoiceRow) => {
    setPaymentInvoice(inv)
    const due = Math.max(Number(inv.total_amount) - Number(inv.amount_paid), 0)
    paymentForm.reset({ amount: due, method: 'upi', reference: '', paid_at: '', notes: '' })
    setPaymentOpen(true)
  }

  const submitInvoice = invoiceForm.handleSubmit(async (values) => {
    try {
      if (editing) await mutations.updateInvoice.mutateAsync({ id: editing.id, values })
      else await mutations.createInvoice.mutateAsync(values)
      toast({ title: editing ? 'Invoice updated' : 'Invoice created' })
      setInvoiceOpen(false)
    } catch (e) { invoiceForm.setError('root', { message: getErrorMessage(e) }) }
  })

  const submitPayment = paymentForm.handleSubmit(async (values) => {
    if (!paymentInvoice) return
    try {
      await mutations.recordPayment.mutateAsync({ invoiceId: paymentInvoice.id, values })
      toast({ title: 'Payment recorded' })
      setPaymentOpen(false)
    } catch (e) { paymentForm.setError('root', { message: getErrorMessage(e) }) }
  })

  const contactName = (id: string | null) => contacts.data?.find(c => c.id === id)?.full_name ?? '—'
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
  const printInvoice = (inv: InvoiceRow) => {
    const items = Array.isArray(inv.line_items) ? inv.line_items as Array<{ description?: string; quantity?: number; unit_price?: number }> : []
    const biz = activeTenant?.businesses?.name ?? 'Business'
    const contact = contactName(inv.contact_id)
    const rows = items.map((i) => `<tr><td style="padding:10px;border-bottom:1px solid #e5e7eb">${esc(String(i.description ?? ''))}</td><td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${Number(i.quantity ?? 0)}</td><td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${inr.format(Number(i.unit_price ?? 0))}</td><td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${inr.format(Number(i.quantity ?? 0) * Number(i.unit_price ?? 0))}</td></tr>`).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(inv.invoice_number)}</title>
    <style>body{font-family:Arial,sans-serif;margin:0;background:#f3f4f6;color:#111827}.page{max-width:800px;margin:24px auto;background:#fff;padding:40px;border:1px solid #e5e7eb}.head{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #0f766e;padding-bottom:20px}.brand{font-size:28px;font-weight:700;color:#0f766e}.muted{color:#6b7280;font-size:13px}.badge{display:inline-block;padding:4px 10px;border-radius:999px;background:#ecfeff;color:#0f766e;font-size:12px;font-weight:600;text-transform:capitalize}table{width:100%;border-collapse:collapse;margin-top:24px}th{background:#f9fafb;text-align:left;padding:10px;font-size:12px;color:#6b7280;text-transform:uppercase}th.r,td.r{text-align:right}.totals{width:320px;margin-left:auto;margin-top:20px}.totals td{padding:6px 0}.total{font-size:18px;font-weight:700;border-top:1px solid #e5e7eb}.notes{margin-top:28px;padding:14px;background:#f9fafb;border-radius:8px;font-size:13px;color:#374151}@media print{body{background:#fff}.page{margin:0;border:none;max-width:none} .no-print{display:none}}</style></head>
    <body><div class="page"><div class="head"><div><div class="brand">${esc(biz)}</div><div class="muted" style="margin-top:6px">Invoice to</div><div style="font-weight:600;margin-top:2px">${esc(contact)}</div></div><div style="text-align:right"><div style="font-size:24px;font-weight:700">INVOICE</div><div class="muted" style="margin-top:4px">${esc(inv.invoice_number)}</div><div style="margin-top:8px"><span class="badge">${esc(inv.status.replace('_',' '))}</span></div><div class="muted" style="margin-top:10px">Issue: ${esc(toDateInput(inv.issue_date))}<br/>Due: ${esc(toDateInput(inv.due_date) || '—')}</div></div></div>
    <table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>${rows || '<tr><td colspan="4" style="padding:12px;color:#6b7280">No line items</td></tr>'}</tbody></table>
    <table class="totals"><tr><td class="muted">Subtotal</td><td class="r">${inr.format(Number(inv.subtotal))}</td></tr><tr><td class="muted">Tax</td><td class="r">${inr.format(Number(inv.tax_amount))}</td></tr><tr><td class="muted">Discount</td><td class="r">-${inr.format(Number(inv.discount_amount))}</td></tr><tr class="total"><td>Total</td><td class="r">${inr.format(Number(inv.total_amount))}</td></tr><tr><td class="muted">Paid</td><td class="r">${inr.format(Number(inv.amount_paid))}</td></tr><tr><td class="muted">Balance due</td><td class="r">${inr.format(Math.max(Number(inv.total_amount)-Number(inv.amount_paid),0))}</td></tr></table>
    ${inv.notes ? `<div class="notes"><strong>Notes</strong><div style="margin-top:4px">${esc(inv.notes)}</div></div>` : ''}
    <div class="muted" style="margin-top:28px;text-align:center">Thank you for your business.</div></div>
    <script>window.onload=()=>{window.print();}</script></body></html>`
    const w = window.open('', '_blank')
    if (!w) { toast({ title: 'Pop-up blocked', description: 'Allow pop-ups to print the invoice.' }); return }
    w.document.write(html); w.document.close()
  }
  const anyLoading = invoices.isLoading || payments.isLoading
  const anyError = invoices.isError || payments.isError

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Operations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Payments</h1>
          <p className="mt-1 text-sm text-ink-500">Manual invoice shell. Create invoices and record payments. No payment provider connected.</p>
        </div>
        <Button onClick={openCreate}><Plus className="size-4" /> Create invoice</Button>
      </div>

      <Card className="border-amber-200 bg-amber-50/60">
        <CardContent className="flex items-start gap-3 py-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">Manual mode - no provider connected</p>
            <p className="mt-1 text-amber-800">Invoices and manual payment records are stored in FlowSuite. Online collection (Razorpay/payment links/UPI gateway/webhooks) is not connected yet.</p>
          </div>
        </CardContent>
      </Card>

      {anyLoading ? <div className="space-y-3">{[0,1,2].map(i => <Skeleton key={i} className="h-20" />)}</div>
        : anyError ? <ErrorState message="Couldn't load payments. If 0024 is not applied on hosted, this is expected." onRetry={() => { void invoices.refetch(); void payments.refetch() }} />
        : <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card><CardContent className="py-4"><div className="flex items-center justify-between"><p className="text-xs uppercase tracking-wide text-ink-500">Collected</p><IndianRupee className="size-4 text-ink-400" /></div><p className="mt-1 text-2xl font-bold text-ink-900">{inr.format((invoices.data ?? []).reduce((s, i) => s + Number(i.amount_paid || 0), 0))}</p></CardContent></Card>
            <Card><CardContent className="py-4"><p className="text-xs uppercase tracking-wide text-ink-500">Outstanding</p><p className="mt-1 text-2xl font-bold text-ink-900">{inr.format((invoices.data ?? []).filter(i => i.status !== 'void').reduce((s, i) => s + Math.max(Number(i.total_amount) - Number(i.amount_paid), 0), 0))}</p></CardContent></Card>
            <Card><CardContent className="py-4"><p className="text-xs uppercase tracking-wide text-ink-500">Invoices</p><p className="mt-1 text-2xl font-bold text-ink-900">{invoices.data?.length ?? 0}</p></CardContent></Card>
          </div>

          <Card>
            <CardContent className="space-y-3">
              <h2 className="text-sm font-semibold text-ink-900">Invoices</h2>
              {(invoices.data ?? []).length === 0 ? <EmptyState icon={<Receipt className="size-5" />} title="No invoices yet" description="Create a manual invoice to track clinic payments." action={<Button size="sm" onClick={openCreate}><Plus className="size-4" /> Create invoice</Button>} />
                : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-wide text-ink-500"><tr><th className="py-2 pr-3">Invoice</th><th className="py-2 pr-3">Contact</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Total</th><th className="py-2 pr-3">Paid</th><th className="py-2 pr-3">Due</th><th className="py-2 pr-3">Actions</th></tr></thead><tbody className="divide-y divide-ink-100">
                  {invoices.data!.map(inv => {
                    const due = Math.max(Number(inv.total_amount) - Number(inv.amount_paid), 0)
                    return <tr key={inv.id}>
                      <td className="py-2 pr-3"><button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => openEdit(inv)}>{inv.invoice_number}</button><div className="text-xs text-ink-500">{inv.title}</div></td>
                      <td className="py-2 pr-3 text-xs text-ink-600">{contactName(inv.contact_id)}</td>
                      <td className="py-2 pr-3"><Badge variant={statusVariant[inv.status] ?? 'neutral'}>{inv.status.replace('_', ' ')}</Badge></td>
                      <td className="py-2 pr-3">{inr.format(Number(inv.total_amount))}</td>
                      <td className="py-2 pr-3">{inr.format(Number(inv.amount_paid))}</td>
                      <td className="py-2 pr-3 text-xs text-ink-500">{inv.due_date ? formatDate(inv.due_date) : '—'}</td>
                      <td className="py-2 pr-3"><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setPreviewInvoice(inv)}><Eye className="size-4" /> View</Button>{inv.status !== 'void' && due > 0 ? <Button size="sm" variant="outline" onClick={() => openPayment(inv)}>Record payment</Button> : null}<Button size="sm" variant="ghost" loading={mutations.deleteInvoice.isPending} onClick={() => { if (confirm('Delete this invoice?')) mutations.deleteInvoice.mutate(inv.id) }}><Trash2 className="size-4" /></Button></div></td>
                    </tr>
                  })}
                </tbody></table></div>}
            </CardContent>
          </Card>
        </>}

      <Modal open={invoiceOpen} onClose={() => setInvoiceOpen(false)} title={editing ? 'Edit invoice' : 'Create invoice'} description="Manual invoice. Totals are calculated by the server.">
        <form onSubmit={submitInvoice} className="space-y-4" noValidate>
          {invoiceForm.formState.errors.root?.message ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{invoiceForm.formState.errors.root.message}</p> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="inv-title">Title</Label><Input id="inv-title" {...invoiceForm.register('title')} /><FieldError>{invoiceForm.formState.errors.title?.message}</FieldError></div>
            <div><Label htmlFor="inv-contact">Contact</Label><Select id="inv-contact" {...invoiceForm.register('contact_id')}><option value="">No contact</option>{(contacts.data ?? []).map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}</Select></div>
            <div><Label htmlFor="inv-status">Status</Label><Select id="inv-status" {...invoiceForm.register('status')}><option value="draft">Draft</option><option value="sent">Sent</option><option value="void">Void</option></Select></div>
            <div><Label htmlFor="inv-currency">Currency</Label><Input id="inv-currency" {...invoiceForm.register('currency')} /></div>
            <div><Label htmlFor="inv-issue">Issue date</Label><Input id="inv-issue" type="date" {...invoiceForm.register('issue_date')} /><FieldError>{invoiceForm.formState.errors.issue_date?.message}</FieldError></div>
            <div><Label htmlFor="inv-due">Due date</Label><Input id="inv-due" type="date" {...invoiceForm.register('due_date')} /></div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><Label>Line items</Label><Button type="button" size="sm" variant="outline" onClick={() => append({ description: '', quantity: 1, unit_price: 0 })}>Add item</Button></div>
            {fields.map((field, idx) => (
              <div key={field.id} className="grid gap-2 rounded-lg border border-ink-200 p-3 sm:grid-cols-[1fr_100px_120px_auto]">
                <Input placeholder="Description" {...invoiceForm.register(`line_items.${idx}.description` as const)} />
                <Input type="number" step="0.01" placeholder="Qty" {...invoiceForm.register(`line_items.${idx}.quantity` as const)} />
                <Input type="number" step="0.01" placeholder="Price" {...invoiceForm.register(`line_items.${idx}.unit_price` as const)} />
                <Button type="button" variant="ghost" onClick={() => fields.length > 1 && remove(idx)}><Trash2 className="size-4" /></Button>
                <div className="sm:col-span-4 text-xs text-red-600">{invoiceForm.formState.errors.line_items?.[idx]?.description?.message || invoiceForm.formState.errors.line_items?.[idx]?.quantity?.message || invoiceForm.formState.errors.line_items?.[idx]?.unit_price?.message}</div>
              </div>
            ))}
            <FieldError>{typeof invoiceForm.formState.errors.line_items?.message === 'string' ? invoiceForm.formState.errors.line_items.message : undefined}</FieldError>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><Label htmlFor="inv-tax">Tax</Label><Input id="inv-tax" type="number" step="0.01" {...invoiceForm.register('tax_amount')} /></div>
            <div><Label htmlFor="inv-disc">Discount</Label><Input id="inv-disc" type="number" step="0.01" {...invoiceForm.register('discount_amount')} /></div>
            <div className="rounded-lg bg-ink-50 p-3 text-sm"><div className="flex justify-between"><span className="text-ink-500">Subtotal</span><span>{inr.format(totals.subtotal)}</span></div><div className="flex justify-between font-semibold text-ink-900"><span>Total</span><span>{inr.format(totals.total)}</span></div></div>
          </div>
          <div><Label htmlFor="inv-notes">Notes</Label><Textarea id="inv-notes" {...invoiceForm.register('notes')} /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setInvoiceOpen(false)}>Cancel</Button><Button type="submit" loading={invoiceForm.formState.isSubmitting}>{editing ? 'Save invoice' : 'Create invoice'}</Button></div>
        </form>
      </Modal>

      <Modal open={paymentOpen} onClose={() => setPaymentOpen(false)} title="Record payment" description={paymentInvoice ? `${paymentInvoice.invoice_number} · Due ${inr.format(Math.max(Number(paymentInvoice.total_amount) - Number(paymentInvoice.amount_paid), 0))}` : undefined}>
        <form onSubmit={submitPayment} className="space-y-4" noValidate>
          {paymentForm.formState.errors.root?.message ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{paymentForm.formState.errors.root.message}</p> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="pay-amt">Amount</Label><Input id="pay-amt" type="number" step="0.01" {...paymentForm.register('amount')} /><FieldError>{paymentForm.formState.errors.amount?.message}</FieldError></div>
            <div><Label htmlFor="pay-method">Method</Label><Select id="pay-method" {...paymentForm.register('method')}>{invoicePaymentMethods.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</Select></div>
            <div><Label htmlFor="pay-ref">Reference</Label><Input id="pay-ref" {...paymentForm.register('reference')} placeholder="UPI ref / cash note" /></div>
            <div><Label htmlFor="pay-at">Paid at</Label><Input id="pay-at" type="datetime-local" {...paymentForm.register('paid_at')} /></div>
          </div>
          <div><Label htmlFor="pay-notes">Notes</Label><Textarea id="pay-notes" {...paymentForm.register('notes')} /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button><Button type="submit" loading={paymentForm.formState.isSubmitting}>Record payment</Button></div>
        </form>
      </Modal>

      <Modal open={Boolean(previewInvoice)} onClose={() => setPreviewInvoice(null)} title="Invoice view" description="Free clean theme. Use Print / Save PDF to send to a person.">
        {previewInvoice ? (() => {
          const inv = previewInvoice
          const items = Array.isArray(inv.line_items) ? inv.line_items as Array<{ description?: string; quantity?: number; unit_price?: number }> : []
          const due = Math.max(Number(inv.total_amount) - Number(inv.amount_paid), 0)
          return <div className="space-y-4">
            <div className="rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 border-b border-teal-700/20 pb-4 sm:flex-row sm:justify-between">
                <div><p className="text-2xl font-bold text-teal-700">{activeTenant?.businesses?.name ?? 'Business'}</p><p className="mt-2 text-xs uppercase tracking-wide text-ink-500">Invoice to</p><p className="font-medium text-ink-900">{contactName(inv.contact_id)}</p></div>
                <div className="sm:text-right"><p className="text-2xl font-bold text-ink-900">INVOICE</p><p className="text-sm text-ink-500">{inv.invoice_number}</p><div className="mt-2"><Badge variant={statusVariant[inv.status] ?? 'neutral'}>{inv.status.replace('_', ' ')}</Badge></div><p className="mt-2 text-xs text-ink-500">Issue: {toDateInput(inv.issue_date)}<br/>Due: {toDateInput(inv.due_date) || '—'}</p></div>
              </div>
              <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500"><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">Amount</th></tr></thead><tbody>{items.map((it, i) => <tr key={i} className="border-b border-ink-100"><td className="px-3 py-2">{String(it.description ?? '')}</td><td className="px-3 py-2 text-right">{Number(it.quantity ?? 0)}</td><td className="px-3 py-2 text-right">{inr.format(Number(it.unit_price ?? 0))}</td><td className="px-3 py-2 text-right">{inr.format(Number(it.quantity ?? 0) * Number(it.unit_price ?? 0))}</td></tr>)}</tbody></table></div>
              <div className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm"><div className="flex justify-between text-ink-500"><span>Subtotal</span><span>{inr.format(Number(inv.subtotal))}</span></div><div className="flex justify-between text-ink-500"><span>Tax</span><span>{inr.format(Number(inv.tax_amount))}</span></div><div className="flex justify-between text-ink-500"><span>Discount</span><span>-{inr.format(Number(inv.discount_amount))}</span></div><div className="flex justify-between border-t border-ink-200 pt-1 font-semibold text-ink-900"><span>Total</span><span>{inr.format(Number(inv.total_amount))}</span></div><div className="flex justify-between text-ink-500"><span>Paid</span><span>{inr.format(Number(inv.amount_paid))}</span></div><div className="flex justify-between font-medium text-ink-900"><span>Balance due</span><span>{inr.format(due)}</span></div></div>
              {inv.notes ? <div className="mt-4 rounded-lg bg-ink-50 p-3 text-sm text-ink-700"><p className="font-medium text-ink-900">Notes</p><p className="mt-1 whitespace-pre-wrap">{inv.notes}</p></div> : null}
              <p className="mt-6 text-center text-xs text-ink-400">Thank you for your business.</p>
            </div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPreviewInvoice(null)}>Close</Button><Button onClick={() => printInvoice(inv)}><Printer className="size-4" /> Print / Save PDF</Button></div>
          </div>
        })() : null}
      </Modal>
    </div>
  )
}
