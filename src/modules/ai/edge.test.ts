import { describe, expect, it, vi } from 'vitest'
import type { AiCompletion, AiCompletionRequest, AiProvider } from './providers/types.ts'
import {
  runAgentReply,
  type AgentContext,
  type ChatStore,
} from '../../../supabase/functions/_shared/ai/chat.ts'
import { createAiProvider } from '../../../supabase/functions/_shared/ai/provider.ts'
import { processWhatsAppInbound, type WhatsAppInboundStore } from '../../../supabase/functions/_shared/ai/whatsapp_inbound.ts'
import { sendWhatsAppMessage } from '../../../supabase/functions/_shared/ai/whatsapp_send.ts'
import type { WhatsAppInboundMessage } from '../../../supabase/functions/_shared/ai/whatsapp.ts'

const agent: AgentContext = {
  agent_id: 'agent-1',
  tenant_id: 'tenant-1',
  public_key: 'a'.repeat(64),
  name: 'Front Desk',
  business_name: 'Smile Clinic',
  language: 'en',
  tone: 'friendly',
  response_style: 'short',
  business_info: null,
  working_hours: {},
  booking_permission: false,
  booking_slug: null,
  knowledge: [{ category: 'faq', title: 'Timings', content: 'Open 9am to 6pm' }],
  tools: ['answer_faq'],
}

function completion(reply: string, needsHandoff = false): AiCompletion {
  return {
    content: JSON.stringify({ reply, needs_handoff: needsHandoff, handoff_reason: null }),
    parsed: { reply, needs_handoff: needsHandoff, handoff_reason: null },
    model: 'test-model',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 },
    latencyMs: 12,
    requestId: 'req-1',
    finishReason: 'stop',
  }
}

function fakeProvider(result: AiCompletion = completion('We are open 9am to 6pm.')): AiProvider & {
  complete: ReturnType<typeof vi.fn>
} {
  return {
    id: 'test-provider',
    model: 'test-model',
    complete: vi.fn(async () => result),
  }
}

/** Returns a chat reply for the chat schema and a real classification payload
 * for the qualification schema, so both provider calls can be asserted. */
function qualifyingProvider(qualification: Record<string, unknown>): AiProvider & {
  complete: ReturnType<typeof vi.fn>
} {
  const qualCompletion: AiCompletion = {
    content: JSON.stringify(qualification),
    parsed: qualification,
    model: 'test-model',
    usage: { promptTokens: 8, completionTokens: 4, totalTokens: 12, estimatedCostUsd: 0.0001 },
    latencyMs: 10,
    requestId: 'qual-req-1',
    finishReason: 'stop',
  }
  return {
    id: 'test-provider',
    model: 'test-model',
    complete: vi.fn(async (request: AiCompletionRequest) =>
      request.responseFormat?.name === 'lead_classification'
        ? qualCompletion
        : completion('We are open 9am to 6pm.')),
  }
}

function makeChatStore(overrides: Partial<ChatStore> = {}): ChatStore {
  const base: ChatStore = {
    resolveChannelId: vi.fn(async () => 'channel-1'),
    upsertContact: vi.fn(async () => 'contact-1'),
    findOrCreateConversation: vi.fn(async () => 'conversation-1'),
    appendMessage: vi.fn(async () => 'message-1'),
    checkUsageLimit: vi.fn(async () => true),
    recordUsage: vi.fn(async () => {}),
    requestHandoff: vi.fn(async () => {}),
  }
  return { ...base, ...overrides }
}

describe('server provider selection', () => {
  it('fails closed without a key or with an unsupported provider', () => {
    expect(() => createAiProvider({})).toThrow(/not configured/i)
    expect(() => createAiProvider({ AI_PROVIDER: 'other', OPENAI_API_KEY: 'key' })).toThrow(/unsupported/i)
  })

  it('returns a vendor-neutral provider when OpenAI is configured', () => {
    const provider = createAiProvider({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'test-key' })
    expect(provider.id).toBe('openai')
  })
})

describe('chatbot orchestration', () => {
  it('calls the provider once, stores both messages and logs usage', async () => {
    const provider = fakeProvider()
    const store = makeChatStore()
    const result = await runAgentReply({
      agent,
      channel: 'website_chat',
      identity: { name: 'Asha', phone: '9876543210' },
      message: 'What are your timings?',
      provider,
      store,
    })

    expect(provider.complete).toHaveBeenCalledTimes(1)
    expect(store.appendMessage).toHaveBeenCalledTimes(2)
    expect(store.recordUsage).toHaveBeenCalledTimes(1)
    expect(result.reply).toBe('We are open 9am to 6pm.')
    expect(result.conversationId).toBe('conversation-1')
  })

  it('escalates clinical questions without calling the provider', async () => {
    const provider = fakeProvider()
    const store = makeChatStore()
    const result = await runAgentReply({
      agent,
      channel: 'website_chat',
      identity: {},
      message: 'I have a toothache, what medicine should I take?',
      provider,
      store,
    })

    expect(provider.complete).not.toHaveBeenCalled()
    expect(result.escalatedForSafety).toBe(true)
    expect(result.needsHandoff).toBe(true)
    expect(store.requestHandoff).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'clinical_question' }),
    )
  })

  it('does not call the provider when the usage limit is exhausted', async () => {
    const provider = fakeProvider()
    const store = makeChatStore({ checkUsageLimit: vi.fn(async () => false) })

    await expect(runAgentReply({
      agent,
      channel: 'website_chat',
      identity: {},
      message: 'Hello',
      provider,
      store,
    })).rejects.toMatchObject({ code: 'rate_limited' })

    expect(provider.complete).not.toHaveBeenCalled()
    expect(store.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'rate_limited' }))
  })
})

describe('WhatsApp outbound safety', () => {
  const base = {
    tenantId: 'tenant-1',
    contactId: 'contact-1',
    to: '9876543210',
    content: 'Hello from Smile Clinic',
    accessToken: 'token',
    phoneNumberId: 'phone-1',
    idempotencyKey: 'reply-123456',
  }

  it('blocks sends to opted-out contacts', async () => {
    const fetchImpl = vi.fn()
    await expect(sendWhatsAppMessage({
      ...base,
      state: { sessionOpen: true, optedOut: true, consented: false },
      fetchImpl,
    })).rejects.toMatchObject({ code: 'opted_out' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('requires an approved template outside the service window', async () => {
    const fetchImpl = vi.fn()
    await expect(sendWhatsAppMessage({
      ...base,
      state: { sessionOpen: false, optedOut: false, consented: true },
      fetchImpl,
    })).rejects.toMatchObject({ code: 'template_required' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sends a text reply inside the service window', async () => {
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => new Response(
      JSON.stringify({ messages: [{ id: 'wamid.out.1' }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    const result = await sendWhatsAppMessage({
      ...base,
      state: { sessionOpen: true, optedOut: false, consented: false },
      fetchImpl,
    })

    expect(result.providerMessageId).toBe('wamid.out.1')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as Record<string, unknown>
    expect(body).toMatchObject({ type: 'text', to: '+919876543210' })
  })
})

function makeWhatsAppStore(overrides: Partial<WhatsAppInboundStore> = {}): WhatsAppInboundStore {
  const base: WhatsAppInboundStore = {
    ...makeChatStore(),
    resolveTenantForPhoneNumber: vi.fn(async () => 'tenant-1'),
    getActiveAgent: vi.fn(async () => agent),
    recordWebhookEvent: vi.fn(async () => ({ id: 'event-1', is_duplicate: false })),
    getMessagingState: vi.fn(async () => ({ sessionOpen: true, optedOut: false, consented: false })),
    getCredentialSecretRef: vi.fn(async () => 'WHATSAPP_ACCESS_TOKEN'),
    markMessageDelivered: vi.fn(async () => true),
    findContactId: vi.fn(async () => 'contact-1'),
    recordAssessment: vi.fn(async () => 'assessment-1'),
    getActiveFollowUpSequence: vi.fn(async () => 'sequence-1'),
    enqueueFollowUp: vi.fn(async () => 'job-1'),
  }
  return { ...base, ...overrides }
}

function inboundMessage(overrides: Partial<WhatsAppInboundMessage> = {}): WhatsAppInboundMessage {
  return {
    tenantId: 'tenant-1',
    phoneNumberId: 'phone-1',
    externalMessageId: 'wamid.in.1',
    from: '919876543210',
    timestamp: '1700000000',
    type: 'text',
    text: 'Do you offer cleaning?',
    contactName: 'Asha',
    ...overrides,
  }
}

describe('WhatsApp inbound processing', () => {
  it('skips unmapped tenants before any database write', async () => {
    const store = makeWhatsAppStore()
    const outcomes = await processWhatsAppInbound({
      messages: [inboundMessage({ tenantId: null })],
      store,
      provider: fakeProvider(),
      resolveAccessToken: () => 'token',
    })

    expect(outcomes[0]).toMatchObject({ status: 'skipped', reason: 'tenant_not_mapped' })
    expect(store.recordWebhookEvent).not.toHaveBeenCalled()
  })

  it('skips duplicate provider messages', async () => {
    const store = makeWhatsAppStore({
      recordWebhookEvent: vi.fn(async () => ({ id: 'event-1', is_duplicate: true })),
    })
    const outcomes = await processWhatsAppInbound({
      messages: [inboundMessage()],
      store,
      provider: fakeProvider(),
      resolveAccessToken: () => 'token',
    })

    expect(outcomes[0]).toMatchObject({ status: 'skipped', reason: 'duplicate_event' })
    expect(store.upsertContact).not.toHaveBeenCalled()
    expect(store.findOrCreateConversation).not.toHaveBeenCalled()
  })

  it('stores an inbound reply and sends an AI response through the Graph API', async () => {
    const store = makeWhatsAppStore()
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => new Response(
      JSON.stringify({ messages: [{ id: 'wamid.out.1' }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    const outcomes = await processWhatsAppInbound({
      messages: [inboundMessage()],
      store,
      provider: fakeProvider(),
      resolveAccessToken: () => 'token',
      fetchImpl,
    })

    expect(outcomes[0]).toMatchObject({
      status: 'replied',
      providerMessageId: 'wamid.out.1',
      deliveryStatusUpdated: true,
      // The generic fake provider returns chat-shaped output, so qualification
      // fails validation, but the delivered reply remains a success.
      classification: null,
    })
    expect(outcomes[0]?.qualificationError).toBeDefined()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(store.markMessageDelivered).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      messageId: 'message-1',
      providerMessageId: 'wamid.out.1',
    })
    expect(store.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      externalId: 'wamid.in.1',
      direction: 'inbound',
    }))
  })

  it('keeps a delivered reply successful when delivery bookkeeping fails', async () => {
    const store = makeWhatsAppStore({
      markMessageDelivered: vi.fn(async () => { throw new Error('database unavailable') }),
    })
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => new Response(
      JSON.stringify({ messages: [{ id: 'wamid.out.1' }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    const outcomes = await processWhatsAppInbound({
      messages: [inboundMessage()],
      store,
      provider: fakeProvider(),
      resolveAccessToken: () => 'token',
      fetchImpl,
    })

    expect(outcomes[0]).toMatchObject({
      status: 'replied',
      providerMessageId: 'wamid.out.1',
      deliveryStatusUpdated: false,
      deliveryUpdateError: 'database unavailable',
    })
  })

  it('qualifies the lead after a successful reply without blocking delivery', async () => {
    const store = makeWhatsAppStore()
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => new Response(
      JSON.stringify({ messages: [{ id: 'wamid.out.1' }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    const outcomes = await processWhatsAppInbound({
      messages: [inboundMessage()],
      store,
      provider: qualifyingProvider({
        classification: 'future_follow_up',
        summary: 'Customer asked about cleaning services.',
        intent: 'cleaning',
        serviceInterest: 'cleaning',
      }),
      resolveAccessToken: () => 'token',
      fetchImpl,
    })

    expect(outcomes[0]).toMatchObject({
      status: 'replied',
      providerMessageId: 'wamid.out.1',
      classification: 'future_follow_up',
    })
    expect(store.recordAssessment).toHaveBeenCalledWith(expect.objectContaining({
      classification: 'future_follow_up',
    }))
    expect(store.enqueueFollowUp).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'whatsapp',
    }))
  })
})
