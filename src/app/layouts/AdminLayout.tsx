import { NavLink, Outlet } from 'react-router-dom'
import { ArrowLeft, Building2, CreditCard, Gauge, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/app/providers/AuthProvider'
import { cn } from '@/lib/cn'

const links = [
  { to: '/admin', label: 'Overview', icon: Gauge, end: true },
  { to: '/admin/businesses', label: 'Businesses', icon: Building2, end: false },
  { to: '/admin/plans', label: 'Plans & entitlements', icon: CreditCard, end: false },
]

export function AdminLayout() {
  const { profile, user } = useAuth()

  return (
    <div className="min-h-svh bg-ink-50">
      <header className="flex h-16 items-center gap-3 border-b border-ink-200 bg-white px-4 sm:px-6">
        <span className="flex size-8 items-center justify-center rounded-lg bg-ink-900 text-white">
          <ShieldCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink-900">FlowSuite Platform Admin</p>
          <p className="truncate text-[11px] text-ink-500">{profile?.full_name ?? user?.email}</p>
        </div>
        <NavLink to="/" className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50">
          <ArrowLeft className="size-3.5" /> Business app
        </NavLink>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row">
        <nav className="flex gap-1 overflow-x-auto md:w-56 md:shrink-0 md:flex-col" aria-label="Admin navigation">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition',
                  isActive ? 'bg-brand-600 font-semibold text-white' : 'text-ink-700 hover:bg-ink-100',
                )
              }
            >
              <Icon className="size-4" /> {label}
            </NavLink>
          ))}
        </nav>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
