import type { AiLanguage } from '@/types/database'

/** Chat-style message passed to a provider. Kept vendor-neutral. */
export interface AiTextMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** A strict JSON schema the provider must conform to (structured output). */
export interface AiResponseSchema {
  name: string
  schema: Record<string, unknown>
  strict?: boolean
}

export interface AiCompletionRequest {
  messages: AiTextMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  responseFormat?: AiResponseSchema
  language?: AiLanguage
  requestId?: string
  signal?: AbortSignal
}

export interface AiUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostUsd: number
}

export type AiFinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'unknown'

export interface AiCompletion {
  content: string
  /** Present when responseFormat was supplied; parsed and schema-agnostic. */
  parsed: unknown | null
  model: string
  usage: AiUsage
  latencyMs: number
  requestId: string | null
  finishReason: AiFinishReason
}

/** Vendor-neutral provider contract. Implementations must fail closed. */
export interface AiProvider {
  readonly id: string
  readonly model: string
  complete(request: AiCompletionRequest): Promise<AiCompletion>
}

export interface AiProviderConfig {
  /** Raw key, supplied by a server-side secret store. Never a VITE_* env var. */
  apiKey: string
  model?: string
  baseUrl?: string
  timeoutMs?: number
  maxRetries?: number
  /** Injectable for tests; production uses the global fetch. */
  fetchImpl?: typeof fetch
  /** Injectable for tests; production uses a real timer. */
  sleep?: (ms: number) => Promise<void>
}
