import { describe, expect, it } from 'vitest'
import { classificationLabel, formatCost, statusMessage, summarizeUsage } from './utils'

describe('AI console utilities', () => {
  it('summarises usage from real log rows only', () => {
    const summary = summarizeUsage([
      { total_tokens: 100, estimated_cost: 0.01, success: true, created_at: '2026-01-02T00:00:00Z' },
      { total_tokens: 50, estimated_cost: 0.005, success: false, created_at: '2026-01-03T00:00:00Z' },
    ])
    expect(summary.totalTokens).toBe(150)
    expect(summary.calls).toBe(2)
    expect(summary.failures).toBe(1)
    expect(summary.lastCallAt).toBe('2026-01-03T00:00:00Z')
    expect(formatCost(summary.estimatedCost)).toContain('0.015')
  })

  it('explains fail-closed chatbot errors without inventing success', () => {
    expect(statusMessage('not_configured')).toMatch(/provider is not configured/i)
    expect(statusMessage('service_unavailable')).toMatch(/deployed/i)
    expect(statusMessage('clinical_escalation')).toMatch(/handed to your team/i)
  })

  it('uses readable classification labels', () => {
    expect(classificationLabel('high_intent')).toBe('High intent')
    expect(classificationLabel('custom_value')).toBe('custom_value')
  })
})
