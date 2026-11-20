import type { TenantRole } from '@/types/database'

/**
 * Client-side permissions are for UX only (hiding controls). The database RLS
 * policies and trusted RPCs are the authoritative authorisation layer.
 */
export type Permission =
  | 'manage_business'
  | 'manage_team'
  | 'view_team'
  | 'manage_contacts'
  | 'view_crm'
  | 'manage_deals'
  | 'manage_pipeline'
  | 'manage_appointments'
  | 'manage_booking_config'
  | 'view_reports'
  | 'manage_integrations'
  | 'manage_billing'
  | 'view_audit_log'

const ALL: TenantRole[] = ['owner', 'admin', 'manager', 'employee']

const MATRIX: Record<Permission, TenantRole[]> = {
  manage_business: ['owner', 'admin'],
  manage_team: ['owner', 'admin'],
  view_team: ALL,
  manage_contacts: ['owner', 'admin', 'manager', 'employee'],
  view_crm: ALL,
  manage_deals: ['owner', 'admin', 'manager', 'employee'],
  // Pipeline configuration, assignment and archiving are manager+ in the DB
  // (public.can_manage_crm). Employees only work on their own records.
  manage_pipeline: ['owner', 'admin', 'manager'],
  manage_appointments: ['owner', 'admin', 'manager', 'employee'],
  // Mirrors public.can_manage_bookings(): employees can work appointments but
  // cannot change services, availability, resources or the booking page.
  manage_booking_config: ['owner', 'admin', 'manager'],
  view_reports: ['owner', 'admin', 'manager'],
  manage_integrations: ['owner', 'admin'],
  manage_billing: ['owner'],
  view_audit_log: ['owner', 'admin'],
}

export const ROLE_LABELS: Record<TenantRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee',
}

export function hasPermission(role: TenantRole, permission: Permission): boolean {
  return MATRIX[permission].includes(role)
}

export function isOwner(role: TenantRole): boolean {
  return role === 'owner'
}
