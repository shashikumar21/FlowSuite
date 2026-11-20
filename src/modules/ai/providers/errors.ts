/** Error codes are stable strings so callers can map them to ai_usage_logs.error_code. */
export type AiErrorCode =
  | 'not_configured'
  | 'invalid_request'
  | 'rate_limited'
  | 'timeout'
  | 'provider_error'
  | 'invalid_response'
  | 'schema_mismatch'

export class AiProviderError extends Error {
  readonly code: AiErrorCode
  readonly status: number | null
  readonly retryable: boolean

  constructor(message: string, options: { code: AiErrorCode; status?: number; retryable?: boolean }) {
    super(message)
    this.name = 'AiProviderError'
    this.code = options.code
    this.status = options.status ?? null
    this.retryable = options.retryable ?? false
  }
}

/** Thrown when no key is present. Callers must not fall back to another provider. */
export class AiNotConfiguredError extends AiProviderError {
  constructor(provider: string) {
    super(`${provider} is not configured; refusing to call the provider`, { code: 'not_configured' })
    this.name = 'AiNotConfiguredError'
  }
}

export class AiRateLimitError extends AiProviderError {
  constructor(message: string, status = 429) {
    super(message, { code: 'rate_limited', status, retryable: true })
    this.name = 'AiRateLimitError'
  }
}

export class AiTimeoutError extends AiProviderError {
  constructor(message: string) {
    super(message, { code: 'timeout', retryable: true })
    this.name = 'AiTimeoutError'
  }
}
