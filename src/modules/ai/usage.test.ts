import { describe, expect, it, vi } from 'vitest'
import { AiProviderError } from './providers/errors'
import { buildUsageRecord, requireUsageAllowance } from './usage'

describe('tenant usage limits', () => {
  it('allows a call when the RPC reports allowance', async () => {
    const check = vi.fn(async () => true)
    await expect(requireUsageAllowance('tenant-1', 'agent-1', check)).resolves.toBeUndefined()
    expect(check).toHaveBeenCalledWith('tenant-1', 'agent-1')
  })

  it('fails closed when the tenant is over its cap', async () => {
    const error = await requireUsageAllowance('tenant-1', 'agent-1', async () => false).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AiProviderError)
    expect((error as AiProviderError).code).toBe('rate_limited')
  })

  it('propagates checker failures instead of silently allowing the call', async () => {
    await expect(
      requireUsageAllowance('t', 'a', async () => { throw new Error('rpc down') })
    ).rejects.toThrow('rpc down')
  })
})

describe('usage records', () => {
  it('maps a completion to the ai_record_usage argument shape', () => {
    const record = buildUsageRecord({
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      conversationId: 'conv-1',
      channel: 'website_chat',
      operation: 'chat',
      provider: 'openai',
      completion: {
        content: 'hello',
        parsed: null,
        model: 'gpt-4o-mini',
        usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14, estimatedCostUsd: 0.00001 },
        latencyMs: 120,
        requestId: 'req-1',
        finishReason: 'stop',
      },
    })
    expect(record).toMatchObject({
      tenantId: 'tenant-1',
      agentId: 'agent-1',
      conversationId: 'conv-1',
      channel: 'website_chat',
      operation: 'chat',
      provider: 'openai',
      model: 'gpt-4o-mini',
      promptTokens: 10,
      completionTokens: 4,
      estimatedCost: 0.00001,
      latencyMs: 120,
      success: true,
      errorCode: null,
      requestId: 'req-1',
    })
  })

  it('records a failure without inventing token counts', () => {
    const record = buildUsageRecord({
      tenantId: 'tenant-1',
      agentId: null,
      conversationId: null,
      channel: 'whatsapp',
      operation: 'tool',
      provider: 'openai',
      errorCode: 'timeout',
    })
    expect(record.success).toBe(false)
    expect(record.promptTokens).toBeNull()
    expect(record.completionTokens).toBeNull()
    expect(record.estimatedCost).toBeNull()
    expect(record.model).toBe('')
  })
})
