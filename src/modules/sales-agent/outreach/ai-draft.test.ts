import { describe, expect, it, vi } from 'vitest'
import { AiProviderError } from '@/modules/ai/providers/errors'
import type { AiCompletion, AiProvider } from '@/modules/ai/providers/types'
import {
  DRAFT_RESPONSE_FORMAT,
  buildDraftMessages,
  generateEmailDraft,
  parseGeneratedDraft,
} from './ai-draft'
import type { EmailDraftInput, GeneratedDraft } from './schemas'

const PROSPECT_ID = '06a77082-53a2-4e9c-9c35-3214a76c9ba6'

const input: EmailDraftInput = {
  prospect_id: PROSPECT_ID,
  decision_maker_id: null,
  business_website: 'https://example.com',
  industry: 'Dental',
  product_offered: 'Patient recall software',
  problem_addressed: 'Missed recall appointments',
  campaign_objective: 'Book a 15-minute call',
  tone: 'consultative',
}

const draft: GeneratedDraft = {
  subject: 'A quick idea for your clinic',
  opening: 'I noticed your practice and wanted to reach out.',
  body: 'Many clinics lose revenue when recall reminders slip.',
  cta: 'Would 15 minutes next week help?',
  follow_up_subject: 'Re: a quick idea',
  follow_up_body: 'Just checking whether this is worth a short conversation.',
}

function completion(parsed: unknown, content = JSON.stringify(parsed)): AiCompletion {
  return {
    content,
    parsed,
    model: 'test-model',
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, estimatedCostUsd: 0.0002 },
    latencyMs: 8,
    requestId: 'req-1',
    finishReason: 'stop',
  }
}

function fakeProvider(result: AiCompletion): AiProvider & { complete: ReturnType<typeof vi.fn> } {
  return { id: 'fake', model: 'test-model', complete: vi.fn(async () => result) }
}

describe('draft prompt construction', () => {
  it('includes only supplied facts and forbids delivery claims', () => {
    const messages = buildDraftMessages(input)
    expect(messages).toHaveLength(2)
    expect(messages[0]?.role).toBe('system')
    const text = JSON.stringify(messages)
    expect(text).toContain('Patient recall software')
    expect(text).toContain('Missed recall appointments')
    expect(text).toContain('consultative')
    expect(text).toContain('UNSENT DRAFT')
    expect(text).toContain('Do not claim any email was sent')
    expect(text).not.toContain('email has been delivered')
  })

  it('revalidates input before building a prompt', () => {
    expect(() => buildDraftMessages({ ...input, tone: 'pushy' as never })).toThrow()
  })
})

describe('draft response parsing', () => {
  it('accepts a valid parsed draft', () => {
    expect(parseGeneratedDraft(completion(draft))).toEqual(draft)
  })

  it('falls back to parsing the content string', () => {
    expect(parseGeneratedDraft({ parsed: null, content: JSON.stringify(draft) })).toEqual(draft)
  })

  it('rejects invalid JSON', () => {
    expect(() => parseGeneratedDraft({ parsed: null, content: 'not json' })).toThrow(AiProviderError)
  })

  it('rejects a schema mismatch such as an extra field', () => {
    expect(() => parseGeneratedDraft(completion({ ...draft, sent: true }))).toThrow(AiProviderError)
    try {
      parseGeneratedDraft(completion({ ...draft, sent: true }))
    } catch (error) {
      expect((error as AiProviderError).code).toBe('schema_mismatch')
    }
  })

  it('rejects a missing draft entirely', () => {
    expect(() => parseGeneratedDraft({ parsed: null, content: '' })).toThrow(AiProviderError)
  })
})

describe('generateEmailDraft', () => {
  it('calls the injected provider with a strict response format and returns a validated draft', async () => {
    const provider = fakeProvider(completion(draft))
    const result = await generateEmailDraft(input, provider)

    expect(result).toEqual(draft)
    expect(provider.complete).toHaveBeenCalledTimes(1)
    const request = vi.mocked(provider.complete).mock.calls[0]?.[0]
    expect(request?.responseFormat?.strict).toBe(true)
    expect(request?.responseFormat?.name).toBe(DRAFT_RESPONSE_FORMAT.name)
    expect(request?.messages).toHaveLength(2)
  })

  it('does not call the provider when input is invalid', async () => {
    const provider = fakeProvider(completion(draft))
    await expect(generateEmailDraft({ ...input, product_offered: '' }, provider)).rejects.toThrow()
    expect(provider.complete).not.toHaveBeenCalled()
  })

  it('surfaces provider failures without inventing a draft', async () => {
    const provider: AiProvider = {
      id: 'failing',
      model: 'test-model',
      complete: vi.fn(async () => { throw new AiProviderError('not configured', { code: 'not_configured' }) }),
    }
    await expect(generateEmailDraft(input, provider)).rejects.toThrow('not configured')
  })
})
