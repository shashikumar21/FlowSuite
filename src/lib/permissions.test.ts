import { describe, expect, it } from 'vitest'
import { hasPermission, isOwner } from './permissions'

describe('tenant permissions (UX layer only)', () => {
  it('lets owners manage everything in their tenant', () => {
    expect(hasPermission('owner', 'manage_business')).toBe(true)
    expect(hasPermission('owner', 'manage_team')).toBe(true)
    expect(hasPermission('owner', 'manage_billing')).toBe(true)
    expect(hasPermission('owner', 'view_audit_log')).toBe(true)
  })

  it('does not let employees manage business settings or billing', () => {
    expect(hasPermission('employee', 'manage_business')).toBe(false)
    expect(hasPermission('employee', 'manage_billing')).toBe(false)
    expect(hasPermission('employee', 'manage_team')).toBe(false)
  })

  it('allows employees to work with contacts and appointments', () => {
    expect(hasPermission('employee', 'manage_contacts')).toBe(true)
    expect(hasPermission('employee', 'manage_appointments')).toBe(true)
    expect(hasPermission('employee', 'view_team')).toBe(true)
  })

  it('reserves booking configuration for managers and above', () => {
    expect(hasPermission('owner', 'manage_booking_config')).toBe(true)
    expect(hasPermission('admin', 'manage_booking_config')).toBe(true)
    expect(hasPermission('manager', 'manage_booking_config')).toBe(true)
    expect(hasPermission('employee', 'manage_booking_config')).toBe(false)
  })

  it('restricts reports to manager level and above', () => {
    expect(hasPermission('manager', 'view_reports')).toBe(true)
    expect(hasPermission('employee', 'view_reports')).toBe(false)
  })

  it('lets every active role use the CRM and work with contacts and deals', () => {
    for (const role of ['owner', 'admin', 'manager', 'employee'] as const) {
      expect(hasPermission(role, 'view_crm')).toBe(true)
      expect(hasPermission(role, 'manage_contacts')).toBe(true)
      expect(hasPermission(role, 'manage_deals')).toBe(true)
    }
  })

  it('reserves pipeline configuration, assignment and archiving for managers and above', () => {
    expect(hasPermission('owner', 'manage_pipeline')).toBe(true)
    expect(hasPermission('admin', 'manage_pipeline')).toBe(true)
    expect(hasPermission('manager', 'manage_pipeline')).toBe(true)
    expect(hasPermission('employee', 'manage_pipeline')).toBe(false)
  })

  it('identifies owners', () => {
    expect(isOwner('owner')).toBe(true)
    expect(isOwner('admin')).toBe(false)
  })
})
