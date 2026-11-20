// Server-only HTTP helpers for Edge Functions. Never import from src/**.

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function errorResponse(status: number, code: string, message?: string): Response {
  return jsonResponse({ error: { code, message: message ?? code } }, status);
}

/** Constant-time comparison for webhook tokens and shared secrets. */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i]! ^ right[i]!;
  return diff === 0;
}

/** Trims and validates an idempotency key without accepting arbitrary input. */
export function normalizeIdempotencyKey(value: string | null | undefined): string | null {
  const key = value?.trim();
  if (!key || key.length < 8 || key.length > 200) return null;
  return /^[A-Za-z0-9._:-]+$/.test(key) ? key : null;
}
