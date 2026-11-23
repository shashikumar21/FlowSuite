import { z } from 'zod'
import { requireSupabase } from '@/integrations/supabase/client'
import type { WorkflowFormValues } from './schemas'
import type { WorkflowRow, WorkflowStatus } from './types'

export async function fetchWorkflows(tenantId: string): Promise<WorkflowRow[]> {
  const { data, error } = await requireSupabase()
    .from('workflows' as never)
    .select('*')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as WorkflowRow[]
}

export async function createWorkflow(tenantId: string, values: WorkflowFormValues): Promise<string> {
  const { data, error } = await requireSupabase().rpc('workflows_create' as never, {
    p_tenant: tenantId,
    p_name: values.name,
    p_description: values.description || null,
    p_trigger_type: values.trigger_type,
    p_trigger_config: {},
    p_actions: values.actions as unknown as never,
    p_status: values.status,
  } as never)
  if (error) throw error
  return data as string
}

export async function updateWorkflow(tenantId: string, workflowId: string, values: WorkflowFormValues): Promise<void> {
  const { error } = await requireSupabase().rpc('workflows_update' as never, {
    p_tenant: tenantId,
    p_workflow: workflowId,
    p_name: values.name,
    p_description: values.description || null,
    p_trigger_type: values.trigger_type,
    p_trigger_config: {},
    p_actions: values.actions as unknown as never,
    p_status: values.status,
  } as never)
  if (error) throw error
}

export async function setWorkflowStatus(tenantId: string, workflowId: string, status: WorkflowStatus): Promise<void> {
  const { error } = await requireSupabase().rpc('workflows_set_status' as never, {
    p_tenant: tenantId,
    p_workflow: workflowId,
    p_status: status,
  } as never)
  if (error) throw error
}

export async function deleteWorkflow(tenantId: string, workflowId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('workflows_delete' as never, {
    p_tenant: tenantId,
    p_workflow: workflowId,
  } as never)
  if (error) throw error
}

const manualRunInputSchema = z.object({
  tenantId: z.string().uuid(),
  workflowId: z.string().uuid(),
  dedupeKey: z.string().uuid().optional(),
})

const manualRunResultSchema = z.string().uuid().nullable()

// Runs only local actions (tasks, in-app notices, run logs). No provider call,
// no message send, no review request. Requires the local 0040 migration.
export async function runWorkflowManually(
  tenantId: string,
  workflowId: string,
  dedupeKey?: string,
): Promise<string | null> {
  const input = manualRunInputSchema.parse({ tenantId, workflowId, dedupeKey })
  const { data, error } = await requireSupabase().rpc('workflows_run_manual' as never, {
    p_tenant: input.tenantId,
    p_workflow: input.workflowId,
    p_payload: input.dedupeKey ? { dedupe_key: input.dedupeKey } : {},
  } as never)
  if (error) throw error
  return manualRunResultSchema.parse(data ?? null)
}
