import { describe, expect, it, vi } from 'vitest'
import type { AiProvider } from './providers/types.ts'
import type {
  FollowUpJob,
  FollowUpStore,
} from '../../../supabase/functions/_shared/ai/follow_up.ts'
import { processFollowUpJobs } from '../../../supabase/functions/_shared/ai/follow_up.ts'
import type { AgentContext } from '../../../supabase/functions/_shared/ai/chat.ts'
import {
  QUALIFY_RESPONSE_SCHEMA,
  qualifyLead,
  type QualificationStore,
} from '../../../supabase/functions/_shared/ai/qualification.ts'

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
  knowledge: [],
  tools: ['qualify_lead'],
}

const validResult = {
  classification: 'information_request',
  summary: 'Customer asked about clinic timings.',
  intent: 'timings',
  serviceInterest: null,
}

function qualProvider(parsed: unknown): AiProvider {
  return {
    id: 'test-provider',
    model: 'test-model',
    complete: vi.fn(async () => ({
      content: JSON.stringify(parsed),
      parsed,
      model: 'test-model',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 },
      latencyMs: 10,
      requestId: 'req-1',
      finishReason: 'stop' as const,
    })),
  }
}

function makeQualStore(overrides: Partial<QualificationStore> = {}): QualificationStore {
  const base: QualificationStore = {
    checkUsageLimit: vi.fn(async () => true),
    recordUsage: vi.fn(async () => {}),
    recordAssessment: vi.fn(async () => 'assessment-1'),
    getActiveFollowUpSequence: vi.fn(async () => 'sequence-1'),
    enqueueFollowUp: vi.fn(async () => 'job-1'),
  }
  return { ...base, ...overrides }
}

function qualifyInput(store: QualificationStore, parsed: unknown, overrides: Record<string, unknown> = {}) {
  return {
    agent,
    contactId: 'contact-1',
    conversationId: 'conversation-1',
    customerMessage: 'What are your timings?',
    provider: qualProvider(parsed),
    store,
    ...overrides,
  }
}

describe('lead qualification', () => {
  it('uses a strict response schema with a fixed classification enum', () => {
    expect(QUALIFY_RESPONSE_SCHEMA.additionalProperties).toBe(false)
    expect(QUALIFY_RESPONSE_SCHEMA.properties.classification.enum).toEqual([
      'information_request', 'high_intent', 'future_follow_up', 'not_interested', 'unknown',
    ])
  })

  it('records a validated assessment without inventing a lead score', async () => {
    const store = makeQualStore()
    // A model may emit an invented score; the strict schema must drop it before
    // anything is persisted.
    const result = await qualifyLead(qualifyInput(store, { ...validResult, leadScore: 99 }))

    expect(result).toMatchObject({ classification: 'information_request', assessmentId: 'assessment-1' })
    const assessment = vi.mocked(store.recordAssessment).mock.calls[0]?.[0]
    expect(assessment).toMatchObject({ classification: 'information_request', intent: 'timings' })
    expect(JSON.stringify(assessment)).not.toContain('leadScore')
    expect(JSON.stringify(assessment)).not.toContain('99')
    expect(store.enqueueFollowUp).not.toHaveBeenCalled()
  })

  it('rejects an invented classification with schema_mismatch and logs usage', async () => {
    const store = makeQualStore()
    await expect(qualifyLead(qualifyInput(store, {
      ...validResult,
      classification: 'hot_lead',
    }))).rejects.toMatchObject({ code: 'schema_mismatch' })

    expect(store.recordAssessment).not.toHaveBeenCalled()
    expect(store.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'schema_mismatch' }))
  })

  it('rejects an empty or malformed summary', async () => {
    const store = makeQualStore()
    await expect(qualifyLead(qualifyInput(store, { ...validResult, summary: '' }))).rejects.toMatchObject({
      code: 'schema_mismatch',
    })
    expect(store.recordAssessment).not.toHaveBeenCalled()
  })

  it('enqueues a follow-up only for future_follow_up with an eligible channel', async () => {
    const store = makeQualStore()
    const result = await qualifyLead(qualifyInput(
      store,
      { ...validResult, classification: 'future_follow_up' },
      { followUpChannel: 'whatsapp' },
    ))

    expect(result.followUpJobId).toBe('job-1')
    expect(store.getActiveFollowUpSequence).toHaveBeenCalledWith('tenant-1')
    expect(store.enqueueFollowUp).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      contactId: 'contact-1',
      sequenceId: 'sequence-1',
      channel: 'whatsapp',
    }))
  })

  it('does not enqueue a follow-up when consent/channel is unavailable', async () => {
    const store = makeQualStore()
    const result = await qualifyLead(qualifyInput(
      store,
      { ...validResult, classification: 'future_follow_up' },
      { followUpChannel: null },
    ))

    expect(result.followUpJobId).toBeNull()
    expect(store.enqueueFollowUp).not.toHaveBeenCalled()
  })

  it('does not call the provider when the usage limit is exhausted', async () => {
    const store = makeQualStore({ checkUsageLimit: vi.fn(async () => false) })
    const input = qualifyInput(store, validResult)
    await expect(qualifyLead(input)).rejects.toMatchObject({ code: 'rate_limited' })
    expect(input.provider.complete).not.toHaveBeenCalled()
    expect(store.recordAssessment).not.toHaveBeenCalled()
  })
})

const template = {
  key: 'booking_reminder',
  providerName: 'approved_booking_reminder',
  content: 'Hi {{name}, are you still interested in booking?',
  language: 'en',
}

function makeJob(overrides: Partial<FollowUpJob> = {}): FollowUpJob {
  return {
    jobId: '00000000-0000-4000-8000-000000000001',
    tenantId: 'tenant-1',
    contactId: 'contact-1',
    conversationId: 'conversation-1',
    channel: 'whatsapp',
    idempotencyKey: 'follow-up:job-1',
    contactName: 'Asha',
    contactPhone: '+919876543210',
    contactMobile: null,
    template,
    ...overrides,
  }
}

function makeFollowUpStore(job: FollowUpJob | null, overrides: Partial<FollowUpStore> = {}): FollowUpStore {
  const base: FollowUpStore = {
    claimJob: vi.fn(async () => job),
    getMessagingState: vi.fn(async () => ({ sessionOpen: false, optedOut: false, consented: true })),
    getWhatsappCredentialForTenant: vi.fn(async () => ({
      phoneNumberId: 'phone-1',
      secretRef: 'WHATSAPP_ACCESS_TOKEN',
    })),
    completeJob: vi.fn(async () => {}),
    appendMessage: vi.fn(async () => 'message-1'),
  }
  return { ...base, ...overrides }
}

function graphResponse() {
  return vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => new Response(
    JSON.stringify({ messages: [{ id: 'wamid.followup.1' }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ))
}

describe('follow-up worker', () => {
  it('skips opted-out contacts without calling the Graph API', async () => {
    const job = makeJob()
    const store = makeFollowUpStore(job, {
      getMessagingState: vi.fn(async () => ({ sessionOpen: true, optedOut: true, consented: false })),
    })
    const fetchImpl = graphResponse()
    const outcomes = await processFollowUpJobs({
      jobIds: [job.jobId],
      store,
      resolveAccessToken: () => 'token',
      fetchImpl,
    })

    expect(outcomes[0]).toMatchObject({ status: 'skipped', reason: 'opted_out' })
    expect(store.completeJob).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped' }))
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('skips jobs that are not due or already claimed', async () => {
    const job = makeJob()
    const store = makeFollowUpStore(null)
    const outcomes = await processFollowUpJobs({
      jobIds: [job.jobId],
      store,
      resolveAccessToken: () => 'token',
    })

    expect(outcomes[0]).toMatchObject({ status: 'skipped', reason: 'not_due_or_claimed' })
    expect(store.completeJob).not.toHaveBeenCalled()
  })

  it('fails a job that has no approved template', async () => {
    const job = makeJob({ template: null })
    const store = makeFollowUpStore(job)
    const outcomes = await processFollowUpJobs({
      jobIds: [job.jobId],
      store,
      resolveAccessToken: () => 'token',
    })

    expect(outcomes[0]).toMatchObject({ status: 'failed', reason: 'approved_template_missing' })
    expect(store.completeJob).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })

  it('sends an approved template, completes the job and records the outbound message', async () => {
    const job = makeJob()
    const store = makeFollowUpStore(job)
    const fetchImpl = graphResponse()
    const outcomes = await processFollowUpJobs({
      jobIds: [job.jobId],
      store,
      resolveAccessToken: () => 'token',
      fetchImpl,
    })

    expect(outcomes[0]).toMatchObject({ status: 'sent', providerMessageId: 'wamid.followup.1' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const init = fetchImpl.mock.calls[0]?.[1]
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body).toMatchObject({ type: 'template', to: '+919876543210' })
    expect((body.template as Record<string, unknown>).name).toBe('approved_booking_reminder')
    expect(store.completeJob).toHaveBeenCalledWith(expect.objectContaining({
      status: 'sent',
      providerMessageId: 'wamid.followup.1',
    }))
    expect(store.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      direction: 'outbound',
      aiGenerated: false,
    }))
  })

  it('does not send or complete as sent when the tenant has no credential', async () => {
    const job = makeJob()
    const store = makeFollowUpStore(job, {
      getWhatsappCredentialForTenant: vi.fn(async () => null),
    })
    const outcomes = await processFollowUpJobs({
      jobIds: [job.jobId],
      store,
      resolveAccessToken: () => 'token',
    })

    expect(outcomes[0]).toMatchObject({ status: 'failed', reason: 'credential_not_found' })
    expect(store.completeJob).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
    expect(store.appendMessage).not.toHaveBeenCalled()
  })
})
