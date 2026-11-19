import { Copy, Database } from 'lucide-react'
import { APP_NAME } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/Button'

export function SetupRequiredPage() {
  const copyExample = () => {
    void navigator.clipboard?.writeText('cp .env.example .env.local')
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-ink-50 px-4 py-12">
      <div className="w-full max-w-xl rounded-2xl border border-ink-200 bg-white p-8 shadow-card">
        <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Database className="size-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Connect your Supabase project</h1>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          {APP_NAME} is built as a real multi-tenant application. Add your project URL and publishable key to continue —
          no demo data is used in production paths.
        </p>

        <ol className="mt-6 space-y-4 text-sm text-ink-700">
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-bold text-white">1</span>
            <div>
              <p className="font-semibold">Create a Supabase project</p>
              <p className="mt-0.5 text-ink-500">Enable Email auth and set your site URL to this app's origin.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-bold text-white">2</span>
            <div>
              <p className="font-semibold">Apply the migrations</p>
              <p className="mt-0.5 text-ink-500">Run <code className="rounded bg-ink-100 px-1">supabase db push</code> from the project root, then load <code className="rounded bg-ink-100 px-1">supabase/seed.sql</code>.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-bold text-white">3</span>
            <div>
              <p className="font-semibold">Add environment variables</p>
              <p className="mt-0.5 text-ink-500">Copy <code className="rounded bg-ink-100 px-1">.env.example</code> to <code className="rounded bg-ink-100 px-1">.env.local</code> and fill in both values.</p>
            </div>
          </li>
        </ol>

        <div className="mt-6 rounded-lg border border-ink-200 bg-ink-50 p-4 font-mono text-xs text-ink-700">
          <div className="flex items-center justify-between gap-3">
            <code>cp .env.example .env.local</code>
            <Button variant="ghost" size="sm" onClick={copyExample} aria-label="Copy command">
              <Copy className="size-3.5" /> Copy
            </Button>
          </div>
          <p className="mt-2 text-ink-500">VITE_SUPABASE_URL=…</p>
          <p className="text-ink-500">VITE_SUPABASE_PUBLISHABLE_KEY=…</p>
        </div>

        <p className="mt-6 text-xs text-ink-400">
          Only publishable credentials belong in <code>VITE_*</code> variables. Service-role, AI and payment secrets stay
          server-side.
        </p>
      </div>
    </main>
  )
}
