import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Bell,
  Check,
  ChevronDown,
  ChevronsUpDown,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  UserCircle2,
  X,
} from 'lucide-react'
import { useAuth } from '@/app/providers/AuthProvider'
import { useTenant } from '@/app/providers/TenantProvider'
import { navigation } from '@/app/config/navigation'
import { Avatar } from '@/components/ui/Feedback'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'

export function AppLayout() {
  const { profile, user, isPlatformAdmin, signOut } = useAuth()
  const { tenants, activeTenant, switchTenant } = useTenant()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openMenu, setOpenMenu] = useState<'tenant' | 'notifications' | 'profile' | 'ai' | null>(null)

  const closeMenus = () => setOpenMenu(null)

  const selectTenant = (tenantId: string) => {
    switchTenant(tenantId)
    closeMenus()
    setMobileOpen(false)
    navigate('/')
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-ink-950 text-ink-300">
      <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-xs font-black text-white">F</span>
        <span className="text-base font-bold tracking-tight text-white">FlowSuite</span>
        <button
          type="button"
          className="ml-auto rounded-md p-1 text-ink-400 hover:text-white lg:hidden"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        >
          <X className="size-5" />
        </button>
      </div>

      <nav className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Main navigation">
        {navigation.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.label}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/app'}
                      onClick={() => {
                        setMobileOpen(false)
                        closeMenus()
                      }}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                          isActive ? 'bg-brand-600/20 font-semibold text-white' : 'hover:bg-white/5 hover:text-white',
                        )
                      }
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {!item.available ? (
                        <span className="size-1.5 rounded-full bg-ink-600" title="Planned module" />
                      ) : null}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        {isPlatformAdmin ? (
          <NavLink
            to="/admin"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                isActive ? 'bg-brand-600/20 font-semibold text-white' : 'hover:bg-white/5 hover:text-white',
              )
            }
          >
            <ShieldCheck className="size-4" /> Platform admin
          </NavLink>
        ) : null}
        <p className="px-3 pt-3 text-[11px] text-ink-600">Multi-tenant workspace · INR · Asia/Kolkata</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-svh bg-ink-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-64 shadow-popover">{sidebar}</aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-ink-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            className="rounded-md p-1.5 text-ink-600 hover:bg-ink-100 lg:hidden"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === 'tenant' ? null : 'tenant')}
              className="flex max-w-52 items-center gap-2 rounded-lg border border-ink-200 px-2.5 py-1.5 text-left hover:bg-ink-50 sm:max-w-64"
              aria-expanded={openMenu === 'tenant'}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-100 text-[11px] font-bold text-brand-700">
                {activeTenant?.businesses?.name?.slice(0, 2).toUpperCase() ?? '—'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink-900">
                  {activeTenant?.businesses?.name ?? 'No business'}
                </span>
                <span className="block truncate text-[11px] text-ink-500">{activeTenant?.role ?? '—'}</span>
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-ink-400" />
            </button>

            {openMenu === 'tenant' ? (
              <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-xl border border-ink-200 bg-white p-1.5 shadow-popover">
                <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-ink-400">Your businesses</p>
                {tenants.map((membership) => (
                  <button
                    key={membership.tenant_id}
                    type="button"
                    onClick={() => selectTenant(membership.tenant_id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-ink-50"
                  >
                    <span className="flex-1 truncate text-ink-800">{membership.businesses?.name}</span>
                    <Badge variant="neutral">{membership.role}</Badge>
                    {membership.tenant_id === activeTenant?.tenant_id ? <Check className="size-4 text-brand-600" /> : null}
                  </button>
                ))}
                <div className="my-1 border-t border-ink-100" />
                <NavLink to="/onboarding/business" onClick={closeMenus} className="block rounded-lg px-2.5 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50">
                  + Add another business
                </NavLink>
              </div>
            ) : null}
          </div>

          <div className="relative mx-auto hidden w-full max-w-md md:block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <input
              type="search"
              disabled
              placeholder="Search contacts on the Contacts screen"
              title="Contact search is available on the Contacts screen"
              className="h-10 w-full cursor-not-allowed rounded-lg border border-ink-200 bg-ink-50 pl-9 pr-3 text-sm text-ink-400"
            />
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <div className="relative">
              <button
                type="button"
                aria-label="AI assistant"
                onClick={() => setOpenMenu(openMenu === 'ai' ? null : 'ai')}
                className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 hover:bg-brand-100"
              >
                <Sparkles className="size-4" />
              </button>
              {openMenu === 'ai' ? (
                <Popover title="AI Business Manager" onClose={closeMenus}>
                  <p className="text-sm leading-6 text-ink-600">
                    The AI Business Manager will answer questions about your leads, appointments and revenue in a later
                    milestone. It will only use approved server-side tools scoped to this tenant.
                  </p>
                </Popover>
              ) : null}
            </div>

            <div className="relative">
              <button
                type="button"
                aria-label="Notifications"
                onClick={() => setOpenMenu(openMenu === 'notifications' ? null : 'notifications')}
                className="relative flex size-9 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100"
              >
                <Bell className="size-4" />
              </button>
              {openMenu === 'notifications' ? (
                <Popover title="Notifications" onClose={closeMenus}>
                  <p className="py-4 text-center text-sm text-ink-500">You're all caught up.</p>
                </Popover>
              ) : null}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenMenu(openMenu === 'profile' ? null : 'profile')}
                className="flex items-center gap-2 rounded-lg p-1 hover:bg-ink-100"
                aria-expanded={openMenu === 'profile'}
              >
                <Avatar name={profile?.full_name ?? user?.email} className="size-8" />
                <ChevronDown className="hidden size-3.5 text-ink-400 sm:block" />
              </button>
              {openMenu === 'profile' ? (
                <Popover title={profile?.full_name ?? user?.email ?? 'Account'} onClose={closeMenus} align="right">
                  <div className="space-y-1">
                    <NavLink to="/app/settings/profile" onClick={closeMenus} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink-700 hover:bg-ink-50">
                      <UserCircle2 className="size-4" /> Profile & security
                    </NavLink>
                    {isPlatformAdmin ? (
                      <NavLink to="/admin" onClick={closeMenus} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink-700 hover:bg-ink-50">
                        <ShieldCheck className="size-4" /> Platform admin
                      </NavLink>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void signOut()}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="size-4" /> Sign out
                    </button>
                  </div>
                </Popover>
              ) : null}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>

      {openMenu ? <button className="fixed inset-0 z-10 cursor-default" aria-label="Close menu" onClick={closeMenus} /> : null}
    </div>
  )
}

function Popover({
  title,
  children,
  onClose,
  align = 'left',
}: {
  title: string
  children: ReactNode
  onClose: () => void
  align?: 'left' | 'right'
}) {
  return (
    <div
      className={cn(
        'absolute top-full z-30 mt-2 w-80 rounded-xl border border-ink-200 bg-white p-3 shadow-popover',
        align === 'right' ? 'right-0' : 'left-0',
      )}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-500">{title}</p>
        <button type="button" aria-label="Close" onClick={onClose} className="text-ink-400 hover:text-ink-700">
          <X className="size-3.5" />
        </button>
      </div>
      {children}
    </div>
  )
}
