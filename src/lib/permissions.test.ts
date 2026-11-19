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

  it('restricts reports to manager level and above', () => {
    expect(hasPermission('manager', 'view_reports')).toBe(true)
    expect(hasPermission('employee', 'view_reports')).toBe(false)
  })

  it('identifies owners', () => {
    expect(isOwner('owner')).toBe(true)
    expect(isOwner('admin')).toBe(false)
  })
})
