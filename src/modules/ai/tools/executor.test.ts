import { describe, expect, it, vi } from 'vitest'
import type { AiToolKey } from '@/types/database'
import {
  executeToolCall,
  executeToolCalls,
  filterAllowedTools,
  MUTATING_TOOLS,
  TOOL_ALLOWLIST,
  type ToolContext,
  type ToolHandlers,
} from './executor'

const ctx: ToolContext = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  agentId: '22222222-2222-4222-8222-222222222222',
  conversationId: '33333333-3333-4333-8333-333333333333',
  contactId: '44444444-4444-4444-8444-444444444444',
}

function handlers(overrides: Partial<ToolHandlers> = {}): ToolHandlers {
  const base = Object.fromEntries(
    TOOL_ALLOWLIST.map((key) => [key, vi.fn(async () => ({ ok: true }))])
  ) as unknown as ToolHandlers
  return { ...base, ...overrides }
}

const allEnabled = new Set<AiToolKey>(TOOL_ALLOWLIST)

describe('AI tool allowlist', () => {
  it('mirrors the 10 tool keys from migration 0014', () => {
    expect(TOOL_ALLOWLIST).toHaveLength(10)
    expect(TOOL_ALLOWLIST).toContain('create_booking')
    expect(TOOL_ALLOWLIST).toContain('handoff')
  })

  it('drops unknown keys and duplicates', () => {
    expect(filterAllowedTools(['answer_faq', 'drop_tables', 'answer_faq', 'handoff'])).toEqual([
      'answer_faq',
      'handoff',
    ])
  })

  it('marks only write tools as mutating', () => {
    expect(MUTATING_TOOLS).toContain('create_booking')
    expect(MUTATING_TOOLS).not.toContain('lookup_hours')
  })
})

describe('executeToolCall', () => {
  it('rejects a tool outside the allowlist', async () => {
    const result = await executeToolCall(
      { tool: 'drop_tables', input: {} },
      ctx,
      handlers(),
      { enabledTools: allEnabled }
    )
    expect(result.ok).toBe(false)
    expect(result.code).toBe('unknown_tool')
  })

  it('rejects a tool that is not enabled for the agent', async () => {
    const result = await executeToolCall(
      { tool: 'create_booking', input: {} },
      ctx,
      handlers(),
      { enabledTools: new Set(['answer_faq']) }
    )
    expect(result.code).toBe('disabled_tool')
  })

  it('requires tenant and agent context on every tool', async () => {
    const result = await executeToolCall(
      { tool: 'lookup_hours', input: {} },
      { ...ctx, tenantId: '' },
      handlers(),
      { enabledTools: allEnabled }
    )
    expect(result.code).toBe('missing_tenant')
  })

  it('validates input against the tool schema before calling a handler', async () => {
    const lookup = vi.fn(async () => ({}))
    const result = await executeToolCall(
      { tool: 'lookup_availability', input: { serviceId: 'not-a-uuid', date: '2026-01-01' } },
      ctx,
      handlers({ lookup_availability: lookup }),
      { enabledTools: allEnabled }
    )
    expect(result.code).toBe('invalid_input')
    expect(lookup).not.toHaveBeenCalled()
  })

  it('enforces explicit confirmation for mutating tools', async () => {
    const create = vi.fn(async () => ({ confirmation: 'booking-1' }))
    const options = { enabledTools: allEnabled, confirmationRequired: new Set<AiToolKey>(['create_booking']) }
    const input = {
      serviceId: '22222222-2222-4222-8222-222222222222',
      startAt: '2026-11-21T10:00:00+05:30',
      customerName: 'Asha Sharma',
      customerPhone: '+919876543210',
      idempotencyKey: 'booking-checkpoint-2-1',
    }

    const blocked = await executeToolCall({ tool: 'create_booking', input }, ctx, handlers({ create_booking: create }), options)
    expect(blocked.code).toBe('confirmation_required')

    const allowed = await executeToolCall({ tool: 'create_booking', input, confirmed: true }, ctx, handlers({ create_booking: create }), options)
    expect(allowed.ok).toBe(true)
    expect(allowed.data).toEqual({ confirmation: 'booking-1' })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('passes tenant context to the handler', async () => {
    const setConsent = vi.fn(async () => true)
    await executeToolCall(
      { tool: 'check_consent', input: { channel: 'whatsapp' } },
      ctx,
      handlers({ check_consent: setConsent }),
      { enabledTools: allEnabled }
    )
    expect(setConsent).toHaveBeenCalledWith({ channel: 'whatsapp' }, ctx)
  })

  it('returns a structured failure when a handler throws', async () => {
    const result = await executeToolCall(
      { tool: 'create_lead', input: { firstName: 'Asha' } },
      ctx,
      handlers({ create_lead: async () => { throw new Error('No access to this business') } }),
      { enabledTools: allEnabled }
    )
    expect(result.ok).toBe(false)
    expect(result.code).toBe('handler_failed')
    expect(result.error).toBe('No access to this business')
  })

  it('stops a batch after the first failure', async () => {
    const faq = vi.fn(async () => ({}))
    const results = await executeToolCalls(
      [
        { tool: 'answer_faq', input: { question: 'Do you offer cleaning?' } },
        { tool: 'drop_tables', input: {} },
        { tool: 'lookup_hours', input: {} },
      ],
      ctx,
      handlers({ answer_faq: faq }),
      { enabledTools: allEnabled }
    )
    expect(results).toHaveLength(2)
    expect(results[0]?.ok).toBe(true)
    expect(results[1]?.code).toBe('unknown_tool')
    expect(faq).toHaveBeenCalledTimes(1)
  })
})
