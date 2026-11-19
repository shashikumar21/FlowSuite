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
  | 'manage_appointments'
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
  manage_appointments: ['owner', 'admin', 'manager', 'employee'],
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
