import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAppointments,
  fetchAvailability,
  fetchBookingMetrics,
  fetchBookingOptions,
  fetchPageSettings,
  type AppointmentFilters,
} from './api'

/** Tenant-scoped query keys shared by every booking screen. */
export const bookingKeys = {
  all: (tenantId: string) => ['booking', tenantId] as const,
  metrics: (tenantId: string) => ['booking', tenantId, 'metrics'] as const,
  appointments: (tenantId: string) => ['booking', tenantId, 'appointments'] as const,
  options: (tenantId: string) => ['booking', tenantId, 'options'] as const,
  availability: (tenantId: string) => ['booking', tenantId, 'availability'] as const,
  pageSettings: (tenantId: string) => ['booking', tenantId, 'page-settings'] as const,
  slots: (tenantId: string) => ['booking', tenantId, 'slots'] as const,
}

/** Booking writes can change dashboard counts, so both caches are refreshed. */
export function useBookingInvalidate(tenantId: string | undefined) {
  const queryClient = useQueryClient()
  return () => {
    if (!tenantId) return
    void queryClient.invalidateQueries({ queryKey: bookingKeys.all(tenantId) })
    void queryClient.invalidateQueries({ queryKey: ['dashboard', tenantId] })
  }
}

export function useBookingMetrics(tenantId: string | undefined) {
  return useQuery({
    queryKey: bookingKeys.metrics(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchBookingMetrics(tenantId as string),
  })
}

export function useBookingAppointments(tenantId: string | undefined, filters: AppointmentFilters = {}) {
  return useQuery({
    queryKey: [...bookingKeys.appointments(tenantId ?? ''), filters],
    enabled: Boolean(tenantId),
    queryFn: () => fetchAppointments(tenantId as string, filters),
  })
}

export function useBookingOptions(tenantId: string | undefined) {
  return useQuery({
    queryKey: bookingKeys.options(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchBookingOptions(tenantId as string),
  })
}

export function useBookingAvailability(tenantId: string | undefined) {
  return useQuery({
    queryKey: bookingKeys.availability(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchAvailability(tenantId as string),
  })
}

export function useBookingPageSettings(tenantId: string | undefined) {
  return useQuery({
    queryKey: bookingKeys.pageSettings(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchPageSettings(tenantId as string),
  })
}
