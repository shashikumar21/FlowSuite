import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/integrations/supabase/client', () => ({
  requireSupabase: () => ({ rpc: mocks.rpc, from: mocks.from }),
}))

import {
  createGrowthCampaign,
  createGrowthCreative,
  createGrowthSite,
  deleteGrowthFeedback,
  deleteGrowthReview,
  fetchGrowthCampaigns,
  fetchGrowthCreatives,
  fetchGrowthFeedback,
  fetchGrowthReviews,
  fetchGrowthSubmissions,
  fetchGrowthWebsites,
  recordGrowthFeedback,
  recordGrowthReview,
  recordGrowthSubmission,
  updateGrowthReview,
  updateGrowthSubmission,
} from './api'
import {
  emptyCampaignForm,
  emptyCreativeForm,
  emptyFeedbackForm,
  emptyReviewForm,
  emptySiteForm,
  emptySubmissionForm,
} from './schemas'

const TENANT = '06a77082-53a2-4e9c-9c35-3214a76c9ba6'
const OTHER_TENANT = '11111111-1111-4111-8111-111111111111'
const ENTITY = '35e188c6-d0a2-434f-8a09-e5ea348aff80'

type Chain = Record<string, unknown> & { eq: ReturnType<typeof vi.fn> }

function selectChain(result: { data: unknown; error: unknown }): Chain {
  const chain: Chain = { eq: vi.fn(() => chain) } as Chain
  for (const method of ['select', 'order']) chain[method] = vi.fn(() => chain)
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return chain
}

type TableName =
  | 'growth_campaigns'
  | 'growth_creatives'
  | 'growth_websites'
  | 'growth_form_submissions'
  | 'growth_reviews'
  | 'growth_feedback'

const chains: Record<TableName, Chain> = {} as Record<TableName, Chain>

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rpc.mockResolvedValue({ data: ENTITY, error: null })
  for (const table of [
    'growth_campaigns',
    'growth_creatives',
    'growth_websites',
    'growth_form_submissions',
    'growth_reviews',
    'growth_feedback',
  ] as TableName[]) {
    chains[table] = selectChain({ data: [], error: null })
  }
  mocks.from.mockImplementation((table: TableName) => {
    if (!(table in chains)) throw new Error(`Unexpected table: ${table}`)
    return chains[table]
  })
})

function lastRpc(): [string, Record<string, unknown>] {
  const call = mocks.rpc.mock.calls.at(-1)
  if (!call) throw new Error('No RPC call was made')
  return call as [string, Record<string, unknown>]
}

function expectNoProviderFields(args: Record<string, unknown>) {
  const forbidden = Object.keys(args).filter((key) => /provider|send|sent|deliver|opened|clicked|reach/i.test(key))
  expect(forbidden).toEqual([])
}

describe('tenant-scoped Growth reads', () => {
  it('scopes every table to the active tenant', async () => {
    await fetchGrowthCampaigns(TENANT)
    await fetchGrowthCreatives(TENANT)
    await fetchGrowthWebsites(TENANT)
    await fetchGrowthSubmissions(TENANT)
    await fetchGrowthReviews(TENANT)
    await fetchGrowthFeedback(TENANT)

    for (const table of Object.keys(chains) as TableName[]) {
      expect(chains[table].eq).toHaveBeenCalledWith('tenant_id', TENANT)
      expect(chains[table].eq).not.toHaveBeenCalledWith('tenant_id', OTHER_TENANT)
    }
  })

  it('adds optional child filters without removing the tenant filter', async () => {
    await fetchGrowthCreatives(TENANT, ENTITY)
    await fetchGrowthSubmissions(TENANT, ENTITY)
    expect(chains.growth_creatives.eq).toHaveBeenCalledWith('tenant_id', TENANT)
    expect(chains.growth_creatives.eq).toHaveBeenCalledWith('campaign_id', ENTITY)
    expect(chains.growth_form_submissions.eq).toHaveBeenCalledWith('tenant_id', TENANT)
    expect(chains.growth_form_submissions.eq).toHaveBeenCalledWith('website_id', ENTITY)
  })
})

describe('trusted Growth RPC writes', () => {
  it('creates a campaign with the tenant, dates and no provider fields', async () => {
    const id = await createGrowthCampaign(TENANT, {
      ...emptyCampaignForm(),
      name: 'Festive offer',
      objective: 'Book appointments',
      starts_on: '2026-12-01',
      ends_on: '2026-12-31',
    })
    expect(id).toBe(ENTITY)
    const [name, args] = lastRpc()
    expect(name).toBe('growth_create_campaign')
    expect(args).toMatchObject({
      p_tenant: TENANT,
      p_name: 'Festive offer',
      p_starts_on: '2026-12-01',
      p_ends_on: '2026-12-31',
    })
    expect(args.p_tenant).not.toBe(OTHER_TENANT)
    expectNoProviderFields(args)
  })

  it('sends the campaign id as a separate tenant-scoped argument for creatives', async () => {
    await createGrowthCreative(TENANT, {
      ...emptyCreativeForm(ENTITY),
      name: 'Invite copy',
      message: 'Book a check-up.',
    })
    const [name, args] = lastRpc()
    expect(name).toBe('growth_create_creative')
    expect(args.p_tenant).toBe(TENANT)
    expect(args.p_campaign).toBe(ENTITY)
    expectNoProviderFields(args)
  })

  it('records websites and submissions without hosting or delivery arguments', async () => {
    await createGrowthSite(TENANT, {
      ...emptySiteForm(),
      name: 'Appointment page',
      slug: 'appointment-page',
    })
    expect(lastRpc()[0]).toBe('growth_create_site')
    expectNoProviderFields(lastRpc()[1])

    await recordGrowthSubmission(TENANT, {
      ...emptySubmissionForm(ENTITY),
      full_name: 'Asha Rao',
      email: 'asha@example.test',
    })
    expect(lastRpc()[0]).toBe('growth_record_submission')
    expect(lastRpc()[1]).toMatchObject({
      p_tenant: TENANT,
      p_site: ENTITY,
      p_email: 'asha@example.test',
      p_status: 'new',
    })
    expectNoProviderFields(lastRpc()[1])
  })

  it('passes rating bounds to the RPC but never a responder identity', async () => {
    await recordGrowthReview(TENANT, {
      ...emptyReviewForm(),
      author: 'Ravi Kumar',
      rating: 5,
    })
    const [reviewName, reviewArgs] = lastRpc()
    expect(reviewName).toBe('growth_record_review')
    expect(reviewArgs).toMatchObject({ p_tenant: TENANT, p_rating: 5, p_source: 'google' })
    expect(reviewArgs).not.toHaveProperty('p_responded_by')
    expect(reviewArgs).not.toHaveProperty('responded_by')
    expectNoProviderFields(reviewArgs)

    await updateGrowthReview(TENANT, {
      review_id: ENTITY,
      status: 'responded',
      response: 'Thank you for the feedback.',
    })
    const [updateName, updateArgs] = lastRpc()
    expect(updateName).toBe('growth_update_review')
    expect(updateArgs).toEqual({
      p_tenant: TENANT,
      p_review: ENTITY,
      p_status: 'responded',
      p_response: 'Thank you for the feedback.',
    })
    expect(updateArgs).not.toHaveProperty('p_responded_by')
    expect(updateArgs).not.toHaveProperty('responded_by')
    expectNoProviderFields(updateArgs)
  })

  it('rechecks status changes and deletes inside the tenant scope', async () => {
    await updateGrowthSubmission(TENANT, ENTITY, 'reviewed')
    expect(lastRpc()).toEqual(['growth_update_submission', {
      p_tenant: TENANT,
      p_submission: ENTITY,
      p_status: 'reviewed',
    }])

    await recordGrowthFeedback(TENANT, {
      ...emptyFeedbackForm(),
      customer: 'Meera',
      rating: 4,
    })
    expect(lastRpc()[0]).toBe('growth_record_feedback')
    expectNoProviderFields(lastRpc()[1])

    await deleteGrowthReview(TENANT, ENTITY)
    expect(lastRpc()).toEqual(['growth_delete_review', { p_tenant: TENANT, p_review: ENTITY }])
    await deleteGrowthFeedback(TENANT, ENTITY)
    expect(lastRpc()).toEqual(['growth_delete_feedback', { p_tenant: TENANT, p_feedback: ENTITY }])
  })

  it('does not invent an id when a create RPC returns nothing', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    await expect(createGrowthCampaign(TENANT, {
      ...emptyCampaignForm(), name: 'No id', objective: 'Check the guard',
    })).rejects.toThrow('could not be created')
  })

  it('uses no send/provider RPC anywhere in the Growth API', async () => {
    await createGrowthCampaign(TENANT, { ...emptyCampaignForm(), name: 'A', objective: 'B' })
    await createGrowthCreative(TENANT, { ...emptyCreativeForm(ENTITY), name: 'C', message: 'D' })
    await createGrowthSite(TENANT, { ...emptySiteForm(), name: 'E', slug: 'e' })
    await recordGrowthSubmission(TENANT, { ...emptySubmissionForm(ENTITY), full_name: 'F', email: 'f@example.test' })
    await recordGrowthReview(TENANT, { ...emptyReviewForm(), author: 'G', rating: 5 })
    await recordGrowthFeedback(TENANT, { ...emptyFeedbackForm(), customer: 'H', rating: 5 })

    const names = mocks.rpc.mock.calls.map((call) => call[0] as string)
    expect(names.every((name) => name.startsWith('growth_'))).toBe(true)
    expect(names.some((name) => /send|provider|publish|host/i.test(name))).toBe(false)
    for (const [, args] of mocks.rpc.mock.calls as Array<[string, Record<string, unknown>]>) {
      expectNoProviderFields(args)
    }
  })
})
