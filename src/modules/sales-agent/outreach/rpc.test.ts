import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  invoke: vi.fn(),
}))

vi.mock('@/integrations/supabase/client', () => ({
  requireSupabase: () => ({
    rpc: mocks.rpc,
    from: mocks.from,
    functions: { invoke: mocks.invoke },
  }),
}))

import {
  addSuppression,
  createCampaign,
  fetchCampaigns,
  queueApprovedEmail,
  requestAiDraft,
  reviewEmailDraft,
  submitForApproval,
} from './api'
import { buildIdempotencyKey } from './utils'

const TENANT = '06a77082-53a2-4e9c-9c35-3214a76c9ba6'
const OTHER_TENANT = '11111111-1111-4111-8111-111111111111'
const PROSPECT = '06a77082-53a2-4e9c-9c35-3214a76c9ba6'
const MESSAGE = '35e188c6-d0a2-434f-8a09-e5ea348aff80'

function selectChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'order']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('campaign creation via trusted RPC', () => {
  it('forwards the tenant and real recipient selection to sales_create_campaign', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        campaign_id: MESSAGE,
        recipients_created: 2,
        skipped_no_email: 1,
        skipped_suppressed: 0,
      },
      error: null,
    })

    const result = await createCampaign(TENANT, {
      name: 'Recall campaign',
      objective: 'Book a call',
      tone: 'friendly',
      product_offered: 'Recall software',
      problem_addressed: 'Missed visits',
      prospect_ids: [PROSPECT, OTHER_TENANT],
    })

    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    const [name, args] = mocks.rpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(name).toBe('sales_create_campaign')
    expect(args.p_tenant).toBe(TENANT)
    expect(args.p_prospect_ids).toEqual([PROSPECT, OTHER_TENANT])
    expect(result.campaignId).toBe(MESSAGE)
    expect(result.result).toContain('2 draft recipient(s) created')
    expect(result.result).toContain('1 skipped (no email)')
  })

  it('propagates an RPC error instead of pretending the campaign was created', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('No access to this business') })
    await expect(createCampaign(TENANT, {
      name: 'Recall', objective: 'Book', tone: 'professional',
      product_offered: 'Software', problem_addressed: 'Missed', prospect_ids: [PROSPECT],
    })).rejects.toThrow('No access to this business')
  })
})

describe('server-authoritative mutations', () => {
  it('always sends p_tenant for approval submission', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    await submitForApproval(TENANT, MESSAGE)
    expect(mocks.rpc).toHaveBeenCalledWith('sales_submit_for_approval', { p_tenant: TENANT, p_message: MESSAGE })
  })

  it('sends edits and decision to the review RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    await reviewEmailDraft(TENANT, {
      draft_id: MESSAGE,
      decision: 'reject',
      edited_subject: 'Edited',
      edited_body: 'Edited body',
      reason: 'Off topic',
    })
    const [name, args] = mocks.rpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(name).toBe('sales_review_email_draft')
    expect(args).toMatchObject({ p_tenant: TENANT, p_message: MESSAGE, p_decision: 'reject', p_reason: 'Off topic' })
  })

  it('adds a suppression through the RPC with a tenant', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    await addSuppression(TENANT, 'Person@Example.com', 'unsubscribe', 'test')
    expect(mocks.rpc).toHaveBeenCalledWith('sales_add_suppression', {
      p_tenant: TENANT,
      p_email: 'Person@Example.com',
      p_reason: 'unsubscribe',
      p_source: 'test',
    })
  })
})

describe('duplicate send prevention', () => {
  it('returns the existing queue row id when the RPC reports an idempotent match', async () => {
    mocks.rpc.mockResolvedValue({ data: MESSAGE, error: null })
    const first = await queueApprovedEmail(TENANT, MESSAGE)
    const second = await queueApprovedEmail(TENANT, MESSAGE)
    expect(first).toBe(second)
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    // The database unique index on (tenant_id, idempotency_key) is the real guard.
    expect(buildIdempotencyKey(TENANT, MESSAGE)).toBe(`${TENANT}:${MESSAGE}`)
  })

  it('does not fabricate an id when the RPC returns nothing', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    await expect(queueApprovedEmail(TENANT, MESSAGE)).rejects.toThrow('could not be queued')
  })
})

describe('tenant isolation on reads', () => {
  it('scopes campaign reads to the active tenant', async () => {
    const chain = selectChain({ data: [], error: null })
    mocks.from.mockReturnValue(chain)
    await fetchCampaigns(TENANT)
    expect(mocks.from).toHaveBeenCalledWith('outreach_campaigns')
    expect(chain.eq).toHaveBeenCalledWith('tenant_id', TENANT)
    expect(chain.eq).not.toHaveBeenCalledWith('tenant_id', OTHER_TENANT)
  })
})

describe('AI draft service readiness', () => {
  const input = {
    prospect_id: PROSPECT,
    decision_maker_id: null,
    business_website: '',
    industry: '',
    product_offered: 'Software',
    problem_addressed: 'Missed visits',
    campaign_objective: 'Book a call',
    tone: 'professional' as const,
  }

  it('does not fall back to a fake draft when the function is unavailable', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('FunctionsHttpError: 404') })
    await expect(requestAiDraft(TENANT, input)).rejects.toThrow('not available')
  })

  it('unwraps a validated draft from the Edge Function response', async () => {
    const draft = {
      subject: 'Subject', opening: 'Opening', body: 'Body', cta: 'CTA',
      follow_up_subject: 'Follow up', follow_up_body: 'Reminder',
    }
    mocks.invoke.mockResolvedValue({ data: { draft, saved: false, sent: false }, error: null })
    await expect(requestAiDraft(TENANT, input)).resolves.toEqual(draft)
    const [name, options] = mocks.invoke.mock.calls[0] as [string, { body: { tenant_id: string } }]
    expect(name).toBe('sales-email-draft')
    expect(options.body.tenant_id).toBe(TENANT)
  })

  it('surfaces a server-side not-configured error without claiming a save', async () => {
    mocks.invoke.mockResolvedValue({
      data: { error: { code: 'not_configured', message: 'AI provider is not configured' } },
      error: null,
    })
    await expect(requestAiDraft(TENANT, input)).rejects.toThrow('Nothing was saved or sent.')
  })
})
