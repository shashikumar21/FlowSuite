import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { APP_NAME } from '@/integrations/supabase/client'
import { LegalLinks } from './LegalLinks'

export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <div className="min-h-svh bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-xs font-black text-white">F</span>
          <span className="text-base font-bold tracking-tight text-ink-900">{APP_NAME}</span>
          <Link className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700" to="/login">
            <ArrowLeft className="size-3.5" /> Back to sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Legal</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink-900">{title}</h1>
        <p className="mt-2 text-sm text-ink-500">Last updated {updated}</p>
        <article className="mt-8 space-y-7 rounded-xl border border-ink-200 bg-white p-6 text-sm leading-7 text-ink-700 shadow-xs sm:p-8">
          {children}
        </article>
        <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 pt-5">
          <LegalLinks />
          <p className="text-xs text-ink-400">© {new Date().getFullYear()} {APP_NAME}</p>
        </footer>
      </main>
    </div>
  )
}
