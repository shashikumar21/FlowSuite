import type { TaskRow, TaskStatus, TenantRole } from '@/types/database'
import { taskStatuses } from './schemas'
import type { TaskSummary } from './types'

const labels = Object.fromEntries(
  taskStatuses.map((value) => [value, value.charAt(0).toUpperCase() + value.slice(1).replace('_', ' ')]),
) as Record<TaskStatus, string>

export const taskStatusLabel = (status: TaskStatus) => labels[status] ?? status

export function taskStatusVariant(status: TaskStatus): 'neutral' | 'warning' | 'success' {
  if (status === 'completed') return 'success'
  if (status === 'in_progress') return 'warning'
  return 'neutral'
}

/** UX only. The delete RPC re-checks owner/admin on the server. */
export function canManageTasks(role: TenantRole | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

/** Counts derived only from rows returned by a tenant-scoped SELECT. */
export function buildTaskSummary(tasks: readonly TaskRow[]): TaskSummary {
  return {
    total: tasks.length,
    open: tasks.filter((task) => task.status !== 'completed').length,
    inProgress: tasks.filter((task) => task.status === 'in_progress').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    unassigned: tasks.filter((task) => !task.assigned_to).length,
  }
}
