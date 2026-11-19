import type { ComponentProps, ReactNode } from 'react'
import { AlertCircle, Inbox } from 'lucide-react'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/format'

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-ink-100 text-ink-500">
        {icon ?? <Inbox className="size-5" />}
      </div>
      <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <AlertCircle className="mb-3 size-8 text-red-500" />
      <h3 className="text-sm font-semibold text-ink-900">Couldn't load this data</h3>
      <p className="mt-1 max-w-md text-sm text-ink-500">{message}</p>
      {onRetry ? (
        <button className="mt-4 text-sm font-semibold text-brand-600 hover:text-brand-700" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-ink-200/70', className)} />
}

export function Avatar({
  name,
  className,
  ...props
}: ComponentProps<'span'> & { name?: string | null }) {
  return (
    <span
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700',
        className,
      )}
      aria-label={name ?? 'User'}
      {...props}
    >
      {initials(name)}
    </span>
  )
}
