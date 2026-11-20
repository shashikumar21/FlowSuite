import { describe, expect, it } from 'vitest'
import {
  computeWhatsAppSignature,
  extractWhatsAppPhoneNumbers,
  normalizeWhatsAppSender,
  parseWhatsAppWebhook,
  verifyWebhookRequest,
  verifyWebhookSignature,
} from '../../../supabase/functions/_shared/ai/whatsapp.ts'

const phoneMap = { 'phone-id-1': 'tenant-a' }

describe('WhatsApp webhook verification', () => {
  it('performs the Meta GET handshake with constant-time token match', () => {
    expect(verifyWebhookRequest({ mode: 'subscribe', token: 'secret', challenge: 'abc' }, 'secret')).toBe('abc')
    expect(verifyWebhookRequest({ mode: 'unsubscribe', token: 'secret', challenge: 'abc' }, 'secret')).toBeNull()
    expect(verifyWebhookRequest({ mode: 'subscribe', token: 'wrong', challenge: 'abc' }, 'secret')).toBeNull()
    expect(verifyWebhookRequest({ mode: 'subscribe', token: null, challenge: 'abc' }, 'secret')).toBeNull()
  })

  it('verifies the HMAC signature over the raw body', async () => {
    const raw = '{"object":"whatsapp_business_account"}'
    const signature = await computeWhatsAppSignature('app-secret', raw)
    expect(await verifyWebhookSignature('app-secret', raw, signature)).toBe(true)
    expect(await verifyWebhookSignature('app-secret', raw, 'sha256=deadbeef')).toBe(false)
    expect(await verifyWebhookSignature('app-secret', raw, null)).toBe(false)
    expect(await verifyWebhookSignature('wrong-secret', raw, signature)).toBe(false)
  })

  it('rejects a body altered after signing', async () => {
    const signature = await computeWhatsAppSignature('app-secret', 'original')
    expect(await verifyWebhookSignature('app-secret', 'tampered', signature)).toBe(false)
  })
})

describe('WhatsApp inbound parsing', () => {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          metadata: { phone_number_id: 'phone-id-1' },
          contacts: [{ wa_id: '919876543210', profile: { name: 'Asha' } }],
          messages: [{
            id: 'wamid.1',
            from: '919876543210',
            timestamp: '1700000000',
            type: 'text',
            text: { body: 'Do you offer cleaning?' },
          }],
        },
      }],
    }],
  }

  it('maps a mapped phone number to its tenant', () => {
    const messages = parseWhatsAppWebhook(payload, phoneMap)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      tenantId: 'tenant-a',
      externalMessageId: 'wamid.1',
      from: '919876543210',
      text: 'Do you offer cleaning?',
      contactName: 'Asha',
    })
  })

  it('extracts WABA phone-number IDs for tenant mapping', () => {
    expect(extractWhatsAppPhoneNumbers(payload)).toEqual(['phone-id-1'])
    expect(extractWhatsAppPhoneNumbers({})).toEqual([])
  })

  it('leaves unmapped phone numbers unresolved so the caller can reject them', () => {
    const messages = parseWhatsAppWebhook(payload, {})
    expect(messages[0]?.tenantId).toBeNull()
  })

  it('ignores malformed payloads but keeps non-text rows for dedupe', () => {
    expect(parseWhatsAppWebhook({}, phoneMap)).toEqual([])
    const withStatus = structuredClone(payload)
    const message = (withStatus.entry as Array<{ changes: Array<{ value: { messages: Array<Record<string, unknown>> } }> }>)[0]!.changes[0]!.value.messages[0]!
    message.type = 'status'
    const rows = parseWhatsAppWebhook(withStatus, phoneMap)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.type).toBe('status')
    expect(rows[0]?.text).toBeNull()
  })
})

describe('WhatsApp sender normalisation', () => {
  it('normalises Indian numbers to E.164', () => {
    expect(normalizeWhatsAppSender('9876543210')).toBe('+919876543210')
    expect(normalizeWhatsAppSender('+91 98765 43210')).toBe('+919876543210')
    expect(normalizeWhatsAppSender('919876543210')).toBe('+919876543210')
    expect(normalizeWhatsAppSender('abc')).toBeNull()
  })
})
