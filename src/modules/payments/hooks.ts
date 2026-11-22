import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createInvoice, deleteInvoice, fetchInvoiceContacts, fetchInvoicePayments, fetchInvoices, recordInvoicePayment, updateInvoice } from './api'
import type { InvoiceFormValues, PaymentFormValues } from './schemas'

export const paymentKeys = {
  all: (tenantId: string) => ['payments', tenantId] as const,
  invoices: (tenantId: string) => [...paymentKeys.all(tenantId), 'invoices'] as const,
  payments: (tenantId: string) => [...paymentKeys.all(tenantId), 'invoice-payments'] as const,
  contacts: (tenantId: string) => [...paymentKeys.all(tenantId), 'contacts'] as const,
}

export function useInvoices(tenantId: string | undefined) {
  return useQuery({ queryKey: paymentKeys.invoices(tenantId ?? ''), enabled: Boolean(tenantId), queryFn: () => fetchInvoices(tenantId!) })
}
export function useInvoicePayments(tenantId: string | undefined) {
  return useQuery({ queryKey: paymentKeys.payments(tenantId ?? ''), enabled: Boolean(tenantId), queryFn: () => fetchInvoicePayments(tenantId!) })
}
export function useInvoiceContacts(tenantId: string | undefined) {
  return useQuery({ queryKey: paymentKeys.contacts(tenantId ?? ''), enabled: Boolean(tenantId), queryFn: () => fetchInvoiceContacts(tenantId!) })
}

export function usePaymentMutations(tenantId: string | undefined) {
  const qc = useQueryClient()
  const invalidate = () => { if (tenantId) void qc.invalidateQueries({ queryKey: paymentKeys.all(tenantId) }) }
  return {
    createInvoice: useMutation({ mutationFn: (values: InvoiceFormValues) => createInvoice(tenantId!, values), onSuccess: invalidate }),
    updateInvoice: useMutation({ mutationFn: ({ id, values }: { id: string; values: InvoiceFormValues }) => updateInvoice(tenantId!, id, values), onSuccess: invalidate }),
    recordPayment: useMutation({ mutationFn: ({ invoiceId, values }: { invoiceId: string; values: PaymentFormValues }) => recordInvoicePayment(tenantId!, invoiceId, values), onSuccess: invalidate }),
    deleteInvoice: useMutation({ mutationFn: (id: string) => deleteInvoice(tenantId!, id), onSuccess: invalidate }),
  }
}
