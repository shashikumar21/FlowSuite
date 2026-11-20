import { describe, expect, it } from 'vitest'
import { buildSystemPrompt, CHAT_RESPONSE_SCHEMA, isClinicalQuestion } from './safety'

describe('AI safety rules', () => {
  it('detects clinical questions in English', () => {
    expect(isClinicalQuestion('I have a severe toothache and swelling')).toBe(true)
    expect(isClinicalQuestion('Do I need a root canal?')).toBe(true)
    expect(isClinicalQuestion('What medicine should I take?')).toBe(true)
  })

  it('detects clinical questions in Hindi and Telugu', () => {
    expect(isClinicalQuestion('मेरे दांत में दर्द है')).toBe(true)
    expect(isClinicalQuestion('నాకు నొప్పి ఉంది, ఏ మందు తీసుకోవాలి?')).toBe(true)
  })

  it('does not flag ordinary booking questions', () => {
    expect(isClinicalQuestion('What are your opening hours?')).toBe(false)
    expect(isClinicalQuestion('Can I book a cleaning for Saturday?')).toBe(false)
    expect(isClinicalQuestion('')).toBe(false)
  })

  it('always includes non-diagnosis and handoff rules', () => {
    const prompt = buildSystemPrompt({
      businessName: 'Test Clinic',
      language: 'en',
      tone: 'friendly',
      responseStyle: 'short',
    })
    expect(prompt).toContain('Do NOT diagnose')
    expect(prompt).toContain('Do NOT interpret symptoms')
    expect(prompt).toContain('hand off to a human')
    expect(prompt).toContain('Never claim a booking is confirmed unless a tool call has succeeded')
  })

  it('localises the reply rule for all supported languages', () => {
    const base = { businessName: 'Clinic', tone: 'friendly' as const, responseStyle: 'short' as const }
    expect(buildSystemPrompt({ ...base, language: 'en' })).toContain('Reply in English.')
    expect(buildSystemPrompt({ ...base, language: 'hi' })).toContain('Hindi')
    expect(buildSystemPrompt({ ...base, language: 'te' })).toContain('Telugu')
  })

  it('lists only approved tools and marks booking confirmation rule', () => {
    const prompt = buildSystemPrompt({
      businessName: 'Clinic',
      language: 'en',
      tone: 'professional',
      responseStyle: 'detailed',
      allowedTools: ['answer_faq', 'create_booking'],
      bookingEnabled: true,
    })
    expect(prompt).toContain('answer_faq, create_booking')
    expect(prompt).toContain('Only report success after the tool returns a confirmation')
  })

  it('exposes a strict chat response schema', () => {
    expect(CHAT_RESPONSE_SCHEMA.additionalProperties).toBe(false)
    expect(CHAT_RESPONSE_SCHEMA.required).toContain('needs_handoff')
    expect(CHAT_RESPONSE_SCHEMA.required).toContain('handoff_reason')
  })
})
