import { describe, expect, it, vi } from 'vitest'
import { AiNotConfiguredError, AiProviderError, AiRateLimitError } from './errors'
import { estimateOpenAiCostUsd } from './pricing'
import { OpenAiProvider } from './openai'
import type { AiCompletionRequest } from './types'

function jsonResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
}

function request(overrides: Partial<AiCompletionRequest> = {}): AiCompletionRequest {
  return {
    messages: [{ role: 'user', content: 'What are your opening hours?' }],
    ...overrides,
  }
}

const successBody = {
  id: 'chatcmpl-test',
  model: 'gpt-4o-mini',
  choices: [{ finish_reason: 'stop', message: { content: 'Open at 9.' } }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
}

describe('OpenAiProvider', () => {
  it('fails closed when no API key is supplied', () => {
    expect(() => new OpenAiProvider({ apiKey: '' })).toThrow(AiNotConfiguredError)
    expect(() => new OpenAiProvider({ apiKey: '   ' })).toThrow(AiNotConfiguredError)
  })

  it('sends an authorized request and maps usage, cost and latency', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(successBody, { headers: { 'x-request-id': 'req-1' } }))
    const provider = new OpenAiProvider({ apiKey: 'sk-test', fetchImpl, sleep: async () => {} })

    const result = await provider.complete(request())

    expect(result.content).toBe('Open at 9.')
    expect(result.parsed).toBeNull()
    expect(result.model).toBe('gpt-4o-mini')
    expect(result.requestId).toBe('req-1')
    expect(result.finishReason).toBe('stop')
    expect(result.usage.promptTokens).toBe(10)
    expect(result.usage.completionTokens).toBe(5)
    expect(result.usage.totalTokens).toBe(15)
    expect(result.usage.estimatedCostUsd).toBeGreaterThan(0)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
  })

  it('requests strict structured output and parses the JSON payload', async () => {
    const parsed = { classification: 'high_intent', summary: 'Wants an appointment' }
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        ...successBody,
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(parsed) } }],
      })
    )
    const provider = new OpenAiProvider({ apiKey: 'sk-test', fetchImpl })

    const result = await provider.complete(
      request({
        responseFormat: {
          name: 'lead_assessment',
          schema: {
            type: 'object',
            properties: { classification: { type: 'string' }, summary: { type: 'string' } },
            required: ['classification', 'summary'],
            additionalProperties: false,
          },
        },
      })
    )

    expect(result.parsed).toEqual(parsed)
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    const payload = JSON.parse(init.body as string) as { response_format: { json_schema: { strict: boolean; name: string } } }
    expect(payload.response_format.json_schema.strict).toBe(true)
    expect(payload.response_format.json_schema.name).toBe('lead_assessment')
  })

  it('rejects malformed structured output', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        ...successBody,
        choices: [{ finish_reason: 'stop', message: { content: 'not json' } }],
      })
    )
    const provider = new OpenAiProvider({ apiKey: 'sk-test', fetchImpl })

    await expect(
      provider.complete(request({ responseFormat: { name: 'x', schema: { type: 'object' } } }))
    ).rejects.toMatchObject({ code: 'schema_mismatch' })
  })

  it('retries rate limits and then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'slow down' } }, { status: 429 }))
      .mockResolvedValueOnce(jsonResponse(successBody))
    const sleep = vi.fn(async () => {})
    const provider = new OpenAiProvider({ apiKey: 'sk-test', fetchImpl, sleep })

    const result = await provider.complete(request())

    expect(result.content).toBe('Open at 9.')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('does not retry a non-retryable 401', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: 'bad key' } }, { status: 401 }))
    const provider = new OpenAiProvider({ apiKey: 'sk-test', fetchImpl })

    await expect(provider.complete(request())).rejects.toBeInstanceOf(AiProviderError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('maps 429 to AiRateLimitError', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: 'limit' } }, { status: 429 }))
    const provider = new OpenAiProvider({ apiKey: 'sk-test', fetchImpl, maxRetries: 0 })

    await expect(provider.complete(request())).rejects.toBeInstanceOf(AiRateLimitError)
  })

  it('estimates cost per model and returns zero for unknown models', () => {
    expect(estimateOpenAiCostUsd('gpt-4o-mini', 1_000_000, 0)).toBeCloseTo(0.15)
    expect(estimateOpenAiCostUsd('unknown-model', 1_000_000, 1_000_000)).toBe(0)
  })
})
