import type { ReactNode } from 'react'
import { BarChart3, Bot, Sparkles, Workflow } from 'lucide-react'
import { APP_NAME } from '@/integrations/supabase/client'

const currentYear = new Date().getFullYear()

const highlights = [
  { icon: Sparkles, text: 'One workspace for every local business' },
  { icon: Workflow, text: 'Automate follow-ups and daily operations' },
  { icon: BarChart3, text: 'Know exactly what is driving growth' },
  { icon: Bot, text: 'AI that understands your business data' },
]

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-ink-950 px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -top-40 -right-32 size-[32rem] rounded-full bg-brand-600/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 -left-24 size-[28rem] rounded-full bg-indigo-400/15 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-black">F</span>
          <span className="text-lg font-bold tracking-tight">{APP_NAME}</span>
        </div>

        <div className="relative max-w-lg">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-brand-200">
            AI Business Operating System
          </p>
          <h2 className="text-4xl font-bold leading-[1.15] tracking-tight">
            One platform.
            <br />
            Every business.
            <br />
            Smarter growth.
          </h2>
          <p className="mt-5 text-base leading-7 text-ink-300">
            Get more customers, convert more leads, automate daily operations and understand your revenue — from a
            single workspace built for Indian businesses.
          </p>
          <ul className="mt-9 space-y-3.5">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-ink-200">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="size-4 text-brand-300" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-ink-500">© {currentYear} {APP_NAME}. All rights reserved.</p>
      </section>

      <section className="flex items-center justify-center bg-white px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-black text-white">F</span>
            <span className="text-lg font-bold tracking-tight text-ink-900">{APP_NAME}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-ink-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8 border-t border-ink-100 pt-6 text-sm text-ink-500">{footer}</div> : null}
        </div>
      </section>
    </main>
  )
}
