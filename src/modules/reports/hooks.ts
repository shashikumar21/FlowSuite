import { useQuery } from '@tanstack/react-query'
import {
  fetchBillingUsageReport,
  fetchBookingReport,
  fetchCrmReport,
  fetchInboxReport,
  fetchInvoicePaymentReports,
  fetchInvoiceReports,
  fetchSalesReport,
} from './api'

export const reportKeys = {
  all: (tenantId: string) => ['reports', tenantId] as const,
  crm: (tenantId: string) => [...reportKeys.all(tenantId), 'crm'] as const,
  booking: (tenantId: string) => [...reportKeys.all(tenantId), 'booking'] as const,
  inbox: (tenantId: string) => [...reportKeys.all(tenantId), 'inbox'] as const,
  sales: (tenantId: string) => [...reportKeys.all(tenantId), 'sales'] as const,
  usage: (tenantId: string) => [...reportKeys.all(tenantId), 'usage'] as const,
  invoices: (tenantId: string) => [...reportKeys.all(tenantId), 'invoices'] as const,
  payments: (tenantId: string) => [...reportKeys.all(tenantId), 'payments'] as const,
}

export function useCrmReport(tenantId: string | undefined) {
  return useQuery({
    queryKey: reportKeys.crm(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchCrmReport(tenantId!),
  })
}

export function useBookingReport(tenantId: string | undefined) {
  return useQuery({
    queryKey: reportKeys.booking(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchBookingReport(tenantId!),
  })
}

export function useInboxReport(tenantId: string | undefined) {
  return useQuery({
    queryKey: reportKeys.inbox(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchInboxReport(tenantId!),
  })
}

export function useSalesReport(tenantId: string | undefined) {
  return useQuery({
    queryKey: reportKeys.sales(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchSalesReport(tenantId!),
  })
}

export function useBillingUsageReport(tenantId: string | undefined) {
  return useQuery({
    queryKey: reportKeys.usage(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchBillingUsageReport(tenantId!),
  })
}

export function useInvoiceReports(tenantId: string | undefined) {
  return useQuery({
    queryKey: reportKeys.invoices(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchInvoiceReports(tenantId!),
  })
}

export function useInvoicePaymentReports(tenantId: string | undefined) {
  return useQuery({
    queryKey: reportKeys.payments(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchInvoicePaymentReports(tenantId!),
  })
}
