/** Platform admin UI access is intentionally narrower than the hosted role table. */
export const PLATFORM_ADMIN_ROLES = ['super_admin'] as const

export type PlatformAdminRole = (typeof PLATFORM_ADMIN_ROLES)[number]
