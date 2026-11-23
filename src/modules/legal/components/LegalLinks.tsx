import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'

export function LegalLinks({
  className,
  onNavigate,
}: {
  className?: string
  onNavigate?: () => void
}) {
  return (
    <nav className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 text-xs', className)} aria-label="Legal">
      <Link onClick={onNavigate} className="text-ink-500 underline-offset-2 hover:text-brand-600 hover:underline" to="/privacy">Privacy</Link>
      <Link onClick={onNavigate} className="text-ink-500 underline-offset-2 hover:text-brand-600 hover:underline" to="/terms">Terms</Link>
      <Link onClick={onNavigate} className="text-ink-500 underline-offset-2 hover:text-brand-600 hover:underline" to="/refund">Refunds</Link>
    </nav>
  )
}
