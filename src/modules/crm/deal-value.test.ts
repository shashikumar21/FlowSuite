import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}))

vi.mock('@/integrations/supabase/client', () => ({
  requireSupabase: () => ({ from: mocks.from }),
}))

import { updateDealValue } from './api'
import { dealValueSchema } from './schemas'

const TENANT = '06a77082-53a2-4e9c-9c35-3214a76c9ba6'
const OTHER_TENANT = '11111111-1111-4111-8111-111111111111'
const DEAL = '22222222-2222-4222-8222-222222222222'

type Chain = Record<string, unknown> & {
  eq: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

function updateChain(result: { data: unknown; error: unknown }): Chain {
  const chain = {} as Chain
  chain.eq = vi.fn(() => chain)
  chain.update = vi.fn(() => chain)
  for (const method of ['select', 'returns']) chain[method] = vi.fn(() => chain)
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return chain
}

let chain: Chain

beforeEach(() => {
  vi.clearAllMocks()
  chain = updateChain({ data: [{ id: DEAL }], error: null })
  mocks.from.mockReturnValue(chain)
})

describe('deal value validation', () => {
  it('coerces the input to a number and rejects negative amounts', () => {
    expect(dealValueSchema.parse({ value: '4200' }).value).toBe(4200)
    expect(dealValueSchema.safeParse({ value: '-1' }).success).toBe(false)
    expect(dealValueSchema.safeParse({ value: 'abc' }).success).toBe(false)
  })
})

describe('deal value write', () => {
  it('updates only the value, scoped to the active tenant and deal', async () => {
    await updateDealValue(TENANT, DEAL, 4200)

    expect(mocks.from).toHaveBeenCalledWith('deals')
    expect(chain.update).toHaveBeenCalledWith({ value: 4200 })
    expect(chain.eq).toHaveBeenCalledWith('tenant_id', TENANT)
    expect(chain.eq).toHaveBeenCalledWith('id', DEAL)
    expect(chain.eq).not.toHaveBeenCalledWith('tenant_id', OTHER_TENANT)
  })

  it('reports an error when RLS or a missing deal results in no updated row', async () => {
    chain = updateChain({ data: [], error: null })
    mocks.from.mockReturnValue(chain)

    await expect(updateDealValue(TENANT, DEAL, 4200)).rejects.toThrow(/no longer available/)
  })
})
