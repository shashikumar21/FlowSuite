import { describe, expect, it } from 'vitest'
import { agentSchema, credentialSchema, knowledgeSchema, templateSchema } from './schemas'

describe('AI console form schemas', () => {
  it('mirrors the agent token-limit check', () => {
    const base = {
      name: 'Front desk',
      language: 'en',
      tone: 'friendly',
      response_style: 'short',
      business_info: '',
      booking_permission: false,
      handoff_user_id: '',
      status: 'draft',
    }
    expect(agentSchema.safeParse({ ...base, monthly_token_limit: '' }).success).toBe(true)
    expect(agentSchema.safeParse({ ...base, monthly_token_limit: '25000' }).success).toBe(true)
    expect(agentSchema.safeParse({ ...base, monthly_token_limit: '0' }).success).toBe(false)
    expect(agentSchema.safeParse({ ...base, name: '' }).success).toBe(false)
  })

  it('rejects browser-visible and malformed secret references', () => {
    const base = { channel_id: 'channel-1', provider: 'whatsapp', external_identifier: '' }
    expect(credentialSchema.safeParse({ ...base, secret_ref: 'WHATSAPP_ACCESS_TOKEN' }).success).toBe(true)
    expect(credentialSchema.safeParse({ ...base, secret_ref: 'VITE_SUPABASE_URL' }).success).toBe(false)
    expect(credentialSchema.safeParse({ ...base, secret_ref: 'whatsapp_token' }).success).toBe(false)
    expect(credentialSchema.safeParse({ ...base, secret_ref: 'TOKEN WITH SPACES' }).success).toBe(false)
  })

  it('enforces knowledge and template lengths', () => {
    expect(
      knowledgeSchema.safeParse({
        agent_id: 'agent-1',
        category: 'faq',
        title: 'Cancellation policy',
        content: 'Cancel up to 24 hours before.',
        language: 'en',
        active: true,
      }).success,
    ).toBe(true)
    expect(
      knowledgeSchema.safeParse({
        agent_id: 'agent-1',
        category: 'faq',
        title: 'x'.repeat(201),
        content: 'Valid content',
        language: 'en',
        active: true,
      }).success,
    ).toBe(false)
    expect(
      templateSchema.safeParse({
        template_key: 'reminder',
        provider: 'whatsapp',
        provider_template_name: '',
        language: 'en',
        category: 'reminder',
        content: 'Your appointment is tomorrow.',
        status: 'draft',
      }).success,
    ).toBe(true)
  })
})
