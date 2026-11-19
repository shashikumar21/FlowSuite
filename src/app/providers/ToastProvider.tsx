import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

type ToastVariant = 'success' | 'error' | 'info'
type Toast = { id: number; title: string; description?: string; variant: ToastVariant }

type ToastContextValue = {
  toast: (input: { title: string; description?: string; variant?: ToastVariant }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback<ToastContextValue['toast']>(
    ({ title, description, variant = 'success' }) => {
      const id = Date.now() + Math.random()
      setToasts((current) => [...current, { id, title, description, variant }])
      window.setTimeout(() => dismiss(id), 5000)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((item) => {
          const Icon = icons[item.variant]
          return (
            <div
              key={item.id}
              role="status"
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-4 shadow-popover',
                item.variant === 'error' ? 'border-red-200' : 'border-ink-200',
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 size-5 shrink-0',
                  item.variant === 'error' ? 'text-red-600' : item.variant === 'info' ? 'text-brand-600' : 'text-emerald-600',
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-900">{item.title}</p>
                {item.description ? <p className="mt-0.5 text-xs text-ink-500">{item.description}</p> : null}
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                className="rounded p-0.5 text-ink-400 hover:text-ink-700"
                onClick={() => dismiss(item.id)}
              >
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
