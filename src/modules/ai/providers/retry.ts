import { AiProviderError, AiTimeoutError } from './errors.ts'

export interface RetryOptions {
  maxAttempts: number
  baseDelayMs: number
  sleep: (ms: number) => Promise<void>
  isRetryable?: (error: unknown) => boolean
}

const defaultIsRetryable = (error: unknown): boolean =>
  error instanceof AiProviderError ? error.retryable : error instanceof AiTimeoutError

/**
 * Retries transient provider failures with exponential backoff and jitter.
 * Non-retryable errors (including not_configured) fail immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { maxAttempts, baseDelayMs, sleep, isRetryable = defaultIsRetryable } = options
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt === maxAttempts || !isRetryable(error)) throw error
      const jitter = Math.floor(Math.random() * Math.min(baseDelayMs, 250))
      await sleep(baseDelayMs * 2 ** (attempt - 1) + jitter)
    }
  }

  throw lastError
}
