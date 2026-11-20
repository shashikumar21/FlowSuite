import {
  AiNotConfiguredError,
  AiProviderError,
  AiRateLimitError,
  AiTimeoutError,
} from './errors'
import { estimateOpenAiCostUsd } from './pricing'
import { withRetry } from './retry'
import type {
  AiCompletion,
  AiCompletionRequest,
  AiFinishReason,
  AiProvider,
  AiProviderConfig,
  AiUsage,
} from './types'

const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_MAX_RETRIES = 2

type OpenAiFinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter' | null

interface OpenAiResponse {
  id?: string
  model?: string
  choices?: Array<{
    finish_reason?: OpenAiFinishReason
    message?: { content?: string | null }
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  error?: { message?: string; type?: string; code?: string | number }
}

function mapFinishReason(reason: OpenAiFinishReason | undefined): AiFinishReason {
  switch (reason) {
    case 'stop':
    case 'length':
    case 'tool_calls':
    case 'content_filter':
      return reason
    default:
      return 'unknown'
  }
}

/**
 * OpenAI adapter behind the vendor-neutral AiProvider interface.
 *
 * Security contract:
 * - The key is passed in by a server-side caller; it is never read from env here.
 * - With no key the constructor throws and no network call is possible.
 * - No arbitrary code or SQL is accepted from model output.
 */
export class OpenAiProvider implements AiProvider {
  readonly id = 'openai'
  readonly model: string

  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly fetchImpl: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>

  constructor(config: AiProviderConfig) {
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new AiNotConfiguredError('OpenAI')
    }
    this.apiKey = config.apiKey
    this.model = config.model ?? DEFAULT_MODEL
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES
    this.fetchImpl = config.fetchImpl ?? fetch
    this.sleep = config.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletion> {
    const startedAt = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    const forwardAbort = () => controller.abort()
    request.signal?.addEventListener('abort', forwardAbort, { once: true })

    try {
      return await withRetry(
        async () => {
          const payload: Record<string, unknown> = {
            model: request.model ?? this.model,
            messages: request.messages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
            temperature: request.temperature ?? 0.2,
          }
          if (request.maxTokens != null) payload.max_tokens = request.maxTokens
          if (request.responseFormat) {
            payload.response_format = {
              type: 'json_schema',
              json_schema: {
                name: request.responseFormat.name,
                strict: request.responseFormat.strict ?? true,
                schema: request.responseFormat.schema,
              },
            }
          }

          const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          })

          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as OpenAiResponse | null
            const message = body?.error?.message ?? `OpenAI returned HTTP ${response.status}`
            if (response.status === 429) throw new AiRateLimitError(message, response.status)
            if (response.status === 408 || response.status === 504) {
              throw new AiTimeoutError(message)
            }
            throw new AiProviderError(message, {
              code: 'provider_error',
              status: response.status,
              retryable: response.status >= 500,
            })
          }

          const body = (await response.json()) as OpenAiResponse
          const choice = body.choices?.[0]
          const content = choice?.message?.content
          if (typeof content !== 'string') {
            throw new AiProviderError('OpenAI response contained no message content', {
              code: 'invalid_response',
            })
          }

          let parsed: unknown = null
          if (request.responseFormat) {
            try {
              parsed = JSON.parse(content)
            } catch {
              throw new AiProviderError('OpenAI structured output was not valid JSON', {
                code: 'schema_mismatch',
              })
            }
          }

          const promptTokens = body.usage?.prompt_tokens ?? 0
          const completionTokens = body.usage?.completion_tokens ?? 0
          const model = body.model ?? request.model ?? this.model
          const usage: AiUsage = {
            promptTokens,
            completionTokens,
            totalTokens: body.usage?.total_tokens ?? promptTokens + completionTokens,
            estimatedCostUsd: estimateOpenAiCostUsd(model, promptTokens, completionTokens),
          }

          return {
            content,
            parsed,
            model,
            usage,
            latencyMs: Date.now() - startedAt,
            requestId: response.headers.get('x-request-id') ?? body.id ?? request.requestId ?? null,
            finishReason: mapFinishReason(choice?.finish_reason),
          }
        },
        {
          maxAttempts: this.maxRetries + 1,
          baseDelayMs: 400,
          sleep: this.sleep,
        }
      )
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError' && !request.signal?.aborted) {
        throw new AiTimeoutError('OpenAI request timed out')
      }
      throw error
    } finally {
      clearTimeout(timer)
      request.signal?.removeEventListener('abort', forwardAbort)
    }
  }
}
