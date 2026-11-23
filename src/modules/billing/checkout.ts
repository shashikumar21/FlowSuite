/**
 * Loads Razorpay Checkout on demand. The script is only fetched when a manager
 * explicitly chooses a paid plan. Keys never live in frontend source; the
 * public key id is returned by the server with the signed order.
 */

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js'

export type CheckoutResponse = {
  razorpay_payment_id?: string
  razorpay_order_id?: string
  razorpay_signature?: string
}

export type CheckoutInput = {
  keyId: string
  amountPaise: number
  currency: string
  orderId: string
  name: string
  description: string
  prefill?: { name?: string; email?: string; contact?: string }
  handler: (response: CheckoutResponse) => void
  onDismiss?: () => void
}

type RazorpayInstance = { open: () => void }
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor
  }
}

let loadPromise: Promise<boolean> | null = null

export function loadRazorpayCheckout(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (window.Razorpay) return Promise.resolve(true)
  if (loadPromise) return loadPromise

  loadPromise = new Promise<boolean>((resolve) => {
    const finish = (ok: boolean) => {
      if (!ok) loadPromise = null
      resolve(ok && Boolean(window.Razorpay))
    }
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => finish(true)
    script.onerror = () => finish(false)
    document.body.appendChild(script)
  })
  return loadPromise
}

export function openRazorpayCheckout(input: CheckoutInput): boolean {
  if (!window.Razorpay) return false
  const options: Record<string, unknown> = {
    key: input.keyId,
    amount: input.amountPaise,
    currency: input.currency,
    name: input.name,
    description: input.description,
    order_id: input.orderId,
    handler: input.handler,
    theme: { color: '#4f46e5' },
  }
  if (input.prefill) options.prefill = input.prefill
  if (input.onDismiss) options.modal = { ondismiss: input.onDismiss }
  new window.Razorpay(options).open()
  return true
}
