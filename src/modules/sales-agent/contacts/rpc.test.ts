import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/integrations/supabase/client', () => ({
  requireSupabase: () => ({ rpc: mocks.rpc, from: mocks.from }),
}))

import {
  fetchDecisionMakers,
  fetchReplyViews,
  fetchSignals,
  fetchVerifications,
  recordReply,
  recordVerification,
  updateReply,
} from './api'
import { emptyReplyForm } from './schemas'

const TENANT = '06a77082-53a2-4e9c-9c35-3214a76c9ba6'
const OTHER_TENANT = '11111111-1111-4111-8111-111111111111'
const PROSPECT = '06a77082-53a2-4e9c-9c35-3214a76c9ba6'
const ENTITY = '35e188c6-d0a2-434f-8a09-e5ea348aff80'

type Chain = Record<string, unknown> & { eq: ReturnType<typeof vi.fn> }

function selectChain(result: { data: unknown; error: unknown }): Chain {
  const chain: Chain = { eq: vi.fn(() => chain) } as Chain
  for (const method of ['select', 'order']) chain[method] = vi.fn(() => chain)
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return chain
}

type ChainName = 'replies' | 'prospects' | 'messages' | 'decisionMakers' | 'verifications' | 'signals'
const chains: Record<ChainName, Chain> = {} as Record<ChainName, Chain>

beforeEach(() => {
  vi.clearAllMocks()
  chains.replies = selectChain({
    data: [{
      id: ENTITY, tenant_id: TENANT, message_id: PROSPECT, campaign_id: null,
      prospect_id: PROSPECT, sender_email: 'owner@example.com', subject: 'Hello',
      body: 'Please unsubscribe me', reply_status: 'unread', classification: 'unsubscribe',
      provider: 'manual', external_id: 'manual:1', received_at: '2026-01-05T10:00:00Z', created_at: '2026-01-05T10:00:00Z',
    }],
    error: null,
  })
  chains.prospects = selectChain({ data: [{ id: PROSPECT, business_name: 'Bright Dental', email: null, verification_status: 'unverified' }], error: null })
  chains.messages = selectChain({ data: [{ id: PROSPECT, subject: 'First touch' }], error: null })
  chains.decisionMakers = selectChain({ data: [], error: null })
  chains.verifications = selectChain({ data: [], error: null })
  chains.signals = selectChain({ data: [], error: null })

  mocks.from.mockImplementation((table: string) => {
    if (table === 'outreach_replies') return chains.replies
    if (table === 'prospects') return chains.prospects
    if (table === 'outreach_messages') return chains.messages
    if (table === 'decision_makers') return chains.decisionMakers
    if (table === 'contact_verifications') return chains.verifications
    if (table === 'prospect_signals') return chains.signals
    throw new Error(`Unexpected table: ${table}`)
  })
})

describe('manual verification through a trusted RPC', () => {
  it('passes the tenant, manual method and evidence with no provider name', async () => {
    mocks.rpc.mockResolvedValue({ data: ENTITY, error: null })
    const id = await recordVerification(TENANT, {
      entity_type: 'decision_maker',
      entity_id: ENTITY,
      status: 'verified',
      method: 'manual',
      note: 'Called the clinic and confirmed.',
    })
    expect(id).toBe(ENTITY)
    const [name, args] = mocks.rpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(name).toBe('sales_record_verification')
    expect(args.p_tenant).toBe(TENANT)
    expect(args.p_method).toBe('manual')
    expect(args.p_entity_type).toBe('decision_maker')
    expect(args.p_status).toBe('verified')
    expect(args.p_evidence).toMatchObject({ method: 'manual' })
    expect(args.p_provider).toBeUndefined()
  })

  it('does not invent an id when the RPC returns nothing', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    await expect(recordVerification(TENANT, {
      entity_type: 'prospect', entity_id: PROSPECT, status: 'verified', method: 'manual', note: '',
    })).rejects.toThrow('could not be recorded')
  })
})

describe('reply handling', () => {
  it('normalises the sender and leaves suppression to the server', async () => {
    mocks.rpc.mockResolvedValue({ data: ENTITY, error: null })
    await recordReply(TENANT, {
      ...emptyReplyForm(PROSPECT),
      sender_email: '  Owner@Example.COM  ',
      body: 'Please remove me from your list.',
      classification: 'unsubscribe',
    })
    const [name, args] = mocks.rpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(name).toBe('sales_record_reply')
    expect(args).toMatchObject({
      p_tenant: TENANT,
      p_prospect: PROSPECT,
      p_sender_email: 'owner@example.com',
      p_classification: 'unsubscribe',
    })
    expect(args.p_provider).toBeUndefined()
    expect(args.p_reason).toBeUndefined()
  })

  it('sends only triage fields when classifying an existing reply', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    await updateReply(TENANT, { reply_id: ENTITY, reply_status: 'read', classification: 'unsubscribe' })
    expect(mocks.rpc).toHaveBeenCalledWith('sales_update_reply', {
      p_tenant: TENANT,
      p_reply: ENTITY,
      p_reply_status: 'read',
      p_classification: 'unsubscribe',
    })
  })
})

describe('tenant-scoped reads', () => {
  it('scopes decision makers to the active tenant and optional prospect', async () => {
    await fetchDecisionMakers(TENANT, PROSPECT)
    expect(mocks.from).toHaveBeenCalledWith('decision_makers')
    expect(chains.decisionMakers.eq).toHaveBeenCalledWith('tenant_id', TENANT)
    expect(chains.decisionMakers.eq).toHaveBeenCalledWith('prospect_id', PROSPECT)
    expect(chains.decisionMakers.eq).not.toHaveBeenCalledWith('tenant_id', OTHER_TENANT)
  })

  it('scopes verifications and signals to the active tenant', async () => {
    await fetchVerifications(TENANT, { entityType: 'prospect', entityId: PROSPECT })
    expect(chains.verifications.eq).toHaveBeenCalledWith('tenant_id', TENANT)
    expect(chains.verifications.eq).toHaveBeenCalledWith('entity_type', 'prospect')
    await fetchSignals(TENANT, PROSPECT)
    expect(chains.signals.eq).toHaveBeenCalledWith('tenant_id', TENANT)
    expect(chains.signals.eq).toHaveBeenCalledWith('prospect_id', PROSPECT)
  })

  it('assembles reply context in memory without claiming SQL joins', async () => {
    const views = await fetchReplyViews(TENANT)
    expect(views).toHaveLength(1)
    expect(views[0]?.prospectName).toBe('Bright Dental')
    expect(views[0]?.messageSubject).toBe('First touch')
    expect(chains.replies.eq).toHaveBeenCalledWith('tenant_id', TENANT)
  })
})
