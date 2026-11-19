import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export function NotFoundPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-ink-50 px-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Compass className="size-6" /></span>
      <h1 className="mt-5 text-3xl font-bold tracking-tight text-ink-900">Page not found</h1>
      <p className="mt-2 text-sm text-ink-500">The page you're looking for doesn't exist in this workspace.</p>
      <Link to="/" className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
        Go to dashboard
      </Link>
    </main>
  )
}
