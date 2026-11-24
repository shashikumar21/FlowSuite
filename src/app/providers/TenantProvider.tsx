import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { requireSupabase } from '@/integrations/supabase/client'
import { hasPermission, type Permission } from '@/lib/permissions'
import type { MemberStatus, TenantRole } from '@/types/database'
import { useAuth } from './AuthProvider'

type BusinessSummary = {
  id: string
  name: string
  slug: string
  industry: string
  email: string | null
  phone: string | null
  website: string | null
  google_review_url: string | null
  currency: string
  timezone: string
  status: string
}

export type TenantMembership = {
  tenant_id: string
  role: TenantRole
  status: MemberStatus
  businesses: BusinessSummary | null
}

type TenantContextValue = {
  tenants: TenantMembership[]
  activeTenantId: string | null
  activeTenant: TenantMembership | null
  activeRole: TenantRole | null
  loading: boolean
  error: string | null
  switchTenant: (tenantId: string) => void
  refresh: () => Promise<void>
  can: (permission: Permission) => boolean
}

const TenantContext = createContext<TenantContextValue | null>(null)

function storageKey(userId: string) {
  return `flowsuite:active-tenant:${userId}`
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [tenants, setTenants] = useState<TenantMembership[]>([])
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setTenants([])
      setActiveTenantId(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: queryError } = await requireSupabase()
      .from('business_members')
      .select('tenant_id, role, status, businesses(id, name, slug, industry, email, phone, website, google_review_url, currency, timezone, status)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .returns<TenantMembership[]>()

    if (queryError) {
      setError(queryError.message)
      setLoading(false)
      return
    }

    const memberships = data ?? []
    setTenants(memberships)

    const remembered = window.localStorage.getItem(storageKey(user.id))
    const nextId =
      memberships.find((membership) => membership.tenant_id === remembered)?.tenant_id ??
      memberships[0]?.tenant_id ??
      null

    setActiveTenantId(nextId)
    if (nextId) window.localStorage.setItem(storageKey(user.id), nextId)
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (authLoading) return
    void refresh()
  }, [authLoading, refresh])

  const switchTenant = useCallback(
    (tenantId: string) => {
      if (!user || !tenants.some((membership) => membership.tenant_id === tenantId)) return
      setActiveTenantId(tenantId)
      window.localStorage.setItem(storageKey(user.id), tenantId)
    },
    [user, tenants],
  )

  const activeTenant = useMemo(
    () => tenants.find((membership) => membership.tenant_id === activeTenantId) ?? null,
    [tenants, activeTenantId],
  )

  const value = useMemo<TenantContextValue>(
    () => ({
      tenants,
      activeTenantId,
      activeTenant,
      activeRole: activeTenant?.role ?? null,
      loading,
      error,
      switchTenant,
      refresh,
      can: (permission) => (activeTenant ? hasPermission(activeTenant.role, permission) : false),
    }),
    [tenants, activeTenantId, activeTenant, loading, error, switchTenant, refresh],
  )

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant(): TenantContextValue {
  const context = useContext(TenantContext)
  if (!context) throw new Error('useTenant must be used inside TenantProvider')
  return context
}
