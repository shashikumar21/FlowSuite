import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/integrations/supabase/client', () => ({
  requireSupabase: () => ({ rpc: mocks.rpc, from: mocks.from }),
}))

import {
  createTask,
  deleteTask,
  fetchTaskAssignees,
  fetchTasks,
  setTaskStatus,
  updateTask,
} from './api'
import { emptyTaskForm } from './schemas'

const TENANT = '06a77082-53a2-4e9c-9c35-3214a76c9ba6'
const OTHER_TENANT = '11111111-1111-4111-8111-111111111111'
const OWNER = '35e188c6-d0a2-434f-8a09-e5ea348aff80'
const TASK = '22222222-2222-4222-8222-222222222222'

type Chain = Record<string, unknown> & { eq: ReturnType<typeof vi.fn> }

function selectChain(result: { data: unknown; error: unknown }): Chain {
  const chain: Chain = { eq: vi.fn(() => chain) } as Chain
  for (const method of ['select', 'order', 'returns']) chain[method] = vi.fn(() => chain)
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return chain
}

type TableName = 'tasks' | 'business_members'
const chains: Record<TableName, Chain> = {} as Record<TableName, Chain>

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rpc.mockResolvedValue({ data: TASK, error: null })
  for (const table of ['tasks', 'business_members'] as TableName[]) {
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

function expectNoClientBypass(args: Record<string, unknown>) {
  const forbidden = Object.keys(args).filter((key) =>
    /tenant_id|created_by|completed_by|completed_at|actor|role|permission|provider|send|deliver/i.test(key),
  )
  expect(forbidden).toEqual([])
}

const values = () => ({
  ...emptyTaskForm(),
  title: 'Call the customer back',
  description: 'Confirm the appointment time.',
  assigned_to: OWNER,
  due_at: '2026-12-01T09:00:00.000Z',
})

describe('tenant-scoped Tasks reads', () => {
  it('scopes tasks and assignee options to the active tenant', async () => {
    await fetchTasks(TENANT)
    await fetchTaskAssignees(TENANT)

    expect(chains.tasks.eq).toHaveBeenCalledWith('tenant_id', TENANT)
    expect(chains.tasks.eq).not.toHaveBeenCalledWith('tenant_id', OTHER_TENANT)
    expect(chains.business_members.eq).toHaveBeenCalledWith('tenant_id', TENANT)
    expect(chains.business_members.eq).toHaveBeenCalledWith('status', 'active')
    expect(chains.business_members.eq).not.toHaveBeenCalledWith('tenant_id', OTHER_TENANT)
  })
})

describe('trusted Tasks RPC writes', () => {
  it('creates a task with only content, owner and due date', async () => {
    const id = await createTask(TENANT, values())
    expect(id).toBe(TASK)
    const [name, args] = lastRpc()
    expect(name).toBe('tasks_create_task')
    expect(args).toEqual({
      p_tenant: TENANT,
      p_title: 'Call the customer back',
      p_description: 'Confirm the appointment time.',
      p_assigned_to: OWNER,
      p_due_at: '2026-12-01T09:00:00.000Z',
    })
    expect(args.p_tenant).not.toBe(OTHER_TENANT)
    expect(args).not.toHaveProperty('p_status')
    expectNoClientBypass(args)
  })

  it('updates task details without status, actor or completion state', async () => {
    await updateTask(TENANT, TASK, values())
    expect(lastRpc()).toEqual(['tasks_update_task', {
      p_tenant: TENANT,
      p_task: TASK,
      p_title: 'Call the customer back',
      p_description: 'Confirm the appointment time.',
      p_assigned_to: OWNER,
      p_due_at: '2026-12-01T09:00:00.000Z',
    }])
    expectNoClientBypass(lastRpc()[1])
  })

  it('changes status by passing only the tenant, task and valid status', async () => {
    await setTaskStatus(TENANT, TASK, 'completed')
    expect(lastRpc()).toEqual(['tasks_set_status', {
      p_tenant: TENANT,
      p_task: TASK,
      p_status: 'completed',
    }])
    expectNoClientBypass(lastRpc()[1])
  })

  it('deletes only by tenant and task id, with no client permission claim', async () => {
    await deleteTask(TENANT, TASK)
    expect(lastRpc()).toEqual(['tasks_delete_task', { p_tenant: TENANT, p_task: TASK }])
    expectNoClientBypass(lastRpc()[1])
  })
})
