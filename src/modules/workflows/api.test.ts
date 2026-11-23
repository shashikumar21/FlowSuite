import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
}))

vi.mock('@/integrations/supabase/client', () => ({
  requireSupabase: () => ({ rpc: mocks.rpc, functions: { invoke: mocks.invoke } }),
}))

import { runWorkflowManually } from './api'

const TENANT = '09902c67-e585-427c-98be-df91c211e864'
const WORKFLOW = 'c8518411-ae2a-4134-9701-184bbce5a9a2'
const RUN = 'd44a5ad0-d8f2-4369-9642-a3ddf8cc02c2'
const DEDUPE = 'a44a5ad0-d8f2-4369-9642-a3ddf8cc02c2'

describe('manual workflow runner API', () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
    mocks.invoke.mockReset()
    mocks.rpc.mockResolvedValue({ data: RUN, error: null })
  })

  it('passes tenant, workflow and dedupe key to the scoped RPC', async () => {
    const result = await runWorkflowManually(TENANT, WORKFLOW, DEDUPE)
    expect(result).toBe(RUN)
    expect(mocks.rpc).toHaveBeenCalledWith('workflows_run_manual', {
      p_tenant: TENANT,
      p_workflow: WORKFLOW,
      p_payload: { dedupe_key: DEDUPE },
    })
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('rejects invalid identifiers before calling Supabase', async () => {
    await expect(runWorkflowManually('not-a-uuid', WORKFLOW)).rejects.toThrow()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns null when the workflow was already run for this dedupe key', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    await expect(runWorkflowManually(TENANT, WORKFLOW, DEDUPE)).resolves.toBeNull()
  })

  it('propagates RPC errors and never invokes an Edge Function', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('Manager role required') })
    await expect(runWorkflowManually(TENANT, WORKFLOW)).rejects.toThrow('Manager role required')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})
