import { z } from 'zod'

export const invoiceStatuses = ['draft', 'sent', 'partially_paid', 'paid', 'void'] as const
export const invoicePaymentMethods = ['cash', 'upi', 'card', 'bank_transfer', 'other'] as const

export const lineItemSchema = z.object({
  description: z.string().trim().min(1, 'Description required').max(200),
  quantity: z.coerce.number().min(0.01, 'Qty must be > 0').max(999999),
  unit_price: z.coerce.number().min(0, 'Price must be >= 0').max(99999999),
})

export const invoiceFormSchema = z.object({
  contact_id: z.string(),
  title: z.string().trim().min(1, 'Title is required').max(200),
  status: z.enum(['draft', 'sent', 'void']),
  currency: z.string().trim().length(3).default('INR'),
  issue_date: z.string().min(1, 'Issue date is required'),
  due_date: z.string(),
  line_items: z.array(lineItemSchema).min(1, 'Add at least one line item'),
  tax_amount: z.coerce.number().min(0).max(99999999),
  discount_amount: z.coerce.number().min(0).max(99999999),
  notes: z.string().trim().max(2000),
})
export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>
export type LineItemValues = z.infer<typeof lineItemSchema>

export const paymentFormSchema = z.object({
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0').max(99999999),
  method: z.enum(invoicePaymentMethods),
  reference: z.string().trim().max(120),
  paid_at: z.string(),
  notes: z.string().trim().max(1000),
})
export type PaymentFormValues = z.infer<typeof paymentFormSchema>

export function computeTotals(items: LineItemValues[], tax: number, discount: number) {
  const subtotal = items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
  const total = Math.max(subtotal + (Number(tax) || 0) - (Number(discount) || 0), 0)
  return { subtotal, tax: Number(tax) || 0, discount: Number(discount) || 0, total }
}
