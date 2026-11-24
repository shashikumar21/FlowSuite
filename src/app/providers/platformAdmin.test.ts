import { describe, expect, it } from 'vitest'
import { PLATFORM_ADMIN_ROLES } from './platformAdmin'

describe('PLATFORM_ADMIN_ROLES', () => {
  it('allows only the platform owner role into the admin UI', () => {
    expect(PLATFORM_ADMIN_ROLES).toEqual(['super_admin'])
    expect(PLATFORM_ADMIN_ROLES).not.toContain('support')
  })
})
