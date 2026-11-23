// Server-only Razorpay helpers. Never import from browser code.
// Secrets are supplied by Deno.env at the entry point, never by the client.

const RAZORPAY_API = 'https://api.razorpay.com/v1';

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeHex(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith('sha256=') ? trimmed.slice(7) : trimmed;
}

/** Length-safe string comparison for signature values. */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = normalizeHex(a);
  const right = normalizeHex(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

/** Verifies Razorpay's HMAC over the EXACT raw request body. */
export async function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signature: string | null,
): Promise<boolean> {
  if (!secret.trim() || !signature?.trim()) return false;
  const expected = await hmacSha256Hex(secret, rawBody);
  return constantTimeEqual(expected, signature);
}

/** Verifies the checkout signature: HMAC(order_id + '|' + payment_id). */
export async function verifyPaymentSignature(
  secret: string,
  orderId: string,
  paymentId: string,
  signature: string | null,
): Promise<boolean> {
  if (!secret.trim() || !signature?.trim() || !orderId.trim() || !paymentId.trim()) return false;
  const expected = await hmacSha256Hex(secret, `${orderId}|${paymentId}`);
  return constantTimeEqual(expected, signature);
}

export class RazorpayApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Authenticated server-to-server call to the Razorpay REST API. */
export async function razorpayRequest<T>(
  path: string,
  keyId: string,
  keySecret: string,
  init: RequestInit = {},
): Promise<T> {
  const auth = btoa(`${keyId}:${keySecret}`);
  const response = await fetch(`${RAZORPAY_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }

  if (!response.ok) {
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const error = record.error && typeof record.error === 'object'
      ? (record.error as Record<string, unknown>)
      : record;
    const description = typeof error.description === 'string'
      ? error.description
      : typeof error.message === 'string'
        ? error.message
        : `Razorpay request failed with HTTP ${response.status}`;
    throw new RazorpayApiError(description.slice(0, 300), response.status);
  }

  return body as T;
}
