import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/app/providers/AuthProvider'
import { useTenant } from '@/app/providers/TenantProvider'

function FullPageLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-ink-50">
      <Loader2 className="size-7 animate-spin text-brand-600" />
    </div>
  )
}

export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const { loading: tenantLoading } = useTenant()
  const location = useLocation()

  if (loading || (session && tenantLoading)) return <FullPageLoader />
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return <Outlet />
}

export function RequireTenant() {
  const { isPlatformAdmin } = useAuth()
  const { tenants } = useTenant()
  if (isPlatformAdmin || tenants.length === 0) return <Outlet />
  return <Navigate to="/" replace />
}

export function RequireAdmin() {
  const { isPlatformAdmin } = useAuth()
  if (!isPlatformAdmin) return <Navigate to="/" replace />
  return <Outlet />
}

export function HomeRedirect() {
  const { session, isPlatformAdmin } = useAuth()
  const { tenants, loading } = useTenant()

  if (loading) return <FullPageLoader />
  if (!session) return <Navigate to="/login" replace />
  if (isPlatformAdmin) return <Navigate to="/admin" replace />
  if (tenants.length > 0) return <Navigate to="/app" replace />
  return <Navigate to="/onboarding/business" replace />
}
