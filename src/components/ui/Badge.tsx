import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

const styles: Record<BadgeVariant, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
}

export function Badge({
  className,
  variant = 'neutral',
  ...props
}: ComponentProps<'span'> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        styles[variant],
        className,
      )}
      {...props}
    />
  )
}
