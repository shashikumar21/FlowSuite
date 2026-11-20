import { describe, expect, it, vi } from 'vitest'
import type { VoiceStore, VoiceEvent } from '../../../supabase/functions/_shared/ai/voice.ts'
import {
  isVoiceProvider,
  parseVoiceWebhook,
  processVoiceWebhook,
  verifyVoiceSignature,
} from '../../../supabase/functions/_shared/ai/voice.ts'

const SECRET = 'voice-webhook-secret'

async function signature(body: string, encoding: 'hex' | 'base64' = 'hex'): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))
  if (encoding === 'hex') {
    return `sha256=${Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')}`
  }
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

describe('voice webhook signature', () => {
  it('rejects a missing secret or signature', async () => {
    expect(await verifyVoiceSignature({ secret: '', rawBody: '{}', signature: 'abc' })).toBe(false)
    expect(await verifyVoiceSignature({ secret: SECRET, rawBody: '{}', signature: null })).toBe(false)
  })

  it('accepts a valid hex or base64 HMAC over the exact raw body', async () => {
    const body = '{"CallSid":"call-1"}'
    expect(await verifyVoiceSignature({ secret: SECRET, rawBody: body, signature: await signature(body) })).toBe(true)
    expect(await verifyVoiceSignature({
      secret: SECRET,
      rawBody: body,
      signature: await signature(body, 'base64'),
    })).toBe(true)
  })

  it('rejects a tampered body and malformed signatures', async () => {
    const body = '{"CallSid":"call-1"}'
    const valid = await signature(body)
    expect(await verifyVoiceSignature({ secret: SECRET, rawBody: `${body} `, signature: valid })).toBe(false)
    expect(await verifyVoiceSignature({ secret: SECRET, rawBody: body, signature: 'not-a-signature' })).toBe(false)
  })
})

describe('voice webhook parsing', () => {
  it('allows only provider values accepted by the database check', () => {
    expect(isVoiceProvider('exotel')).toBe(true)
    expect(isVoiceProvider('other')).toBe(true)
    expect(isVoiceProvider('whatsapp')).toBe(false)
  })

  it('normalises common telephony fields safely', () => {
    const event = parseVoiceWebhook({
      CallSid: 'call-1',
      AccountSid: 'account-1',
      From: '+919876543210',
      To: '+912222222222',
      Direction: 'incoming',
      CallStatus: 'in-progress',
    }, 'exotel')

    expect(event).toMatchObject({
      provider: 'exotel',
      accountId: 'account-1',
      callId: 'call-1',
      direction: 'inbound',
      status: 'in_progress',
    })
  })

  it('defaults unknown status to failed and rejects payloads without a call id', () => {
    expect(parseVoiceWebhook({ CallSid: 'call-2', status: 'mystery' }, 'other')?.status).toBe('failed')
    expect(parseVoiceWebhook({ AccountSid: 'account-1' }, 'other')).toBeNull()
    expect(parseVoiceWebhook(null, 'other')).toBeNull()
  })
})

function makeEvent(overrides: Partial<VoiceEvent> = {}): VoiceEvent {
  return {
    provider: 'exotel',
    accountId: 'account-1',
    callId: '00000000-0000-4000-8000-000000000001',
    from: '+919876543210',
    to: '+912222222222',
    direction: 'inbound',
    status: 'completed',
    raw: {},
    ...overrides,
  }
}

function makeStore(overrides: Partial<VoiceStore> = {}): VoiceStore {
  const base: VoiceStore = {
    resolveTenantForAccount: vi.fn(async () => 'tenant-1'),
    recordWebhookEvent: vi.fn(async () => ({ id: 'event-1', is_duplicate: false })),
    upsertCallSession: vi.fn(async () => 'session-1'),
    recordCallLog: vi.fn(async () => {}),
  }
  return { ...base, ...overrides }
}

describe('voice webhook processing (foundation only)', () => {
  it('skips payloads without a tenant mapping before any write', async () => {
    const store = makeStore()
    const result = await processVoiceWebhook({
      event: makeEvent({ accountId: null }),
      store,
    })
    expect(result).toMatchObject({ status: 'skipped', reason: 'account_not_mapped' })
    expect(store.recordWebhookEvent).not.toHaveBeenCalled()
  })

  it('skips unmapped tenants before any write', async () => {
    const store = makeStore({ resolveTenantForAccount: vi.fn(async () => null) })
    const result = await processVoiceWebhook({ event: makeEvent(), store })
    expect(result).toMatchObject({ status: 'skipped', reason: 'tenant_not_mapped' })
    expect(store.recordWebhookEvent).not.toHaveBeenCalled()
  })

  it('skips duplicate call events', async () => {
    const store = makeStore({
      recordWebhookEvent: vi.fn(async () => ({ id: 'event-1', is_duplicate: true })),
    })
    const result = await processVoiceWebhook({ event: makeEvent(), store })
    expect(result).toMatchObject({ status: 'skipped', reason: 'duplicate_event' })
    expect(store.upsertCallSession).not.toHaveBeenCalled()
  })

  it('records one call session and log for a new event', async () => {
    const store = makeStore()
    const result = await processVoiceWebhook({ event: makeEvent(), store })
    expect(result).toMatchObject({ status: 'recorded', sessionId: 'session-1' })
    expect(store.recordWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      externalId: expect.stringContaining('call:'),
      payload: expect.any(Object),
    }))
    expect(store.upsertCallSession).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      callId: expect.any(String),
      status: 'completed',
    }))
    expect(store.recordCallLog).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      sessionId: 'session-1',
      outcome: 'completed',
    }))
  })

  it('makes no provider, audio or contact writes', async () => {
    const store = makeStore()
    const result = await processVoiceWebhook({ event: makeEvent(), store })
    // The store interface deliberately exposes no send/audio/contact methods.
    expect(Object.keys(store).sort()).toEqual([
      'recordCallLog', 'recordWebhookEvent', 'resolveTenantForAccount', 'upsertCallSession',
    ])
    expect(result.status).toBe('recorded')
  })
})
