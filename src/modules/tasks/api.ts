import { requireSupabase } from '@/integrations/supabase/client'
import type { TaskRow, TaskStatus } from '@/types/database'
import type { TaskFormValues } from './schemas'
import type { TaskAssigneeOption } from './types'

/**
 * Tasks data access. Reads are tenant scoped; every write goes through a
 * trusted RPC. No actor identity, completion timestamp, role claim or provider
 * field is ever sent by the browser.
 */

type AssigneeRow = {
  user_id: string
  role: string
  profiles: { full_name: string | null } | null
}

export async function fetchTasks(tenantId: string): Promise<TaskRow[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('due_at', { ascending: true })
    .order('created_at', { ascending: false })
    .returns<TaskRow[]>()
  if (error) throw error
  return data ?? []
}

/** Active members for the owner dropdown. Read-only under RLS. */
export async function fetchTaskAssignees(tenantId: string): Promise<TaskAssigneeOption[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('business_members')
    .select('user_id, role, profiles(full_name)')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .returns<AssigneeRow[]>()
  if (error) throw error
  return (data ?? []).map((row) => ({
    user_id: row.user_id,
    role: row.role,
    full_name: row.profiles?.full_name ?? null,
  }))
}

function requireRpcId(data: unknown): string {
  if (typeof data !== 'string' || !data) throw new Error('The task could not be created.')
  return data
}

export async function createTask(tenantId: string, values: TaskFormValues): Promise<string> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('tasks_create_task', {
    p_tenant: tenantId,
    p_title: values.title,
    p_description: values.description,
    p_assigned_to: values.assigned_to,
    p_due_at: values.due_at,
  })
  if (error) throw error
  return requireRpcId(data)
}

export async function updateTask(tenantId: string, taskId: string, values: TaskFormValues): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('tasks_update_task', {
    p_tenant: tenantId,
    p_task: taskId,
    p_title: values.title,
    p_description: values.description,
    p_assigned_to: values.assigned_to,
    p_due_at: values.due_at,
  })
  if (error) throw error
}

/** Completion is stamped by `tasks_set_status`; this call carries no actor. */
export async function setTaskStatus(tenantId: string, taskId: string, status: TaskStatus): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('tasks_set_status', {
    p_tenant: tenantId,
    p_task: taskId,
    p_status: status,
  })
  if (error) throw error
}

export async function deleteTask(tenantId: string, taskId: string): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('tasks_delete_task', {
    p_tenant: tenantId,
    p_task: taskId,
  })
  if (error) throw error
}
