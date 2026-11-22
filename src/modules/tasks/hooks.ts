import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { salesAgentKeys } from '@/modules/sales-agent/hooks'
import type { TaskStatus } from '@/types/database'
import { createTask, deleteTask, fetchTaskAssignees, fetchTasks, setTaskStatus, updateTask } from './api'
import type { TaskFormValues } from './schemas'

/**
 * Tasks cache. Keys hang off `salesAgentKeys.all(tenantId)`, matching the
 * Phase 4 and Growth pattern, so one invalidation refreshes every tenant view.
 */
export const tasksKeys = {
  all: (tenantId: string) => [...salesAgentKeys.all(tenantId), 'tasks'] as const,
  list: (tenantId: string) => [...tasksKeys.all(tenantId), 'list'] as const,
  assignees: (tenantId: string) => [...tasksKeys.all(tenantId), 'assignees'] as const,
}

export function useTasks(tenantId: string | undefined) {
  return useQuery({
    queryKey: tasksKeys.list(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchTasks(tenantId as string),
  })
}

export function useTaskAssignees(tenantId: string | undefined) {
  return useQuery({
    queryKey: tasksKeys.assignees(tenantId ?? ''),
    enabled: Boolean(tenantId),
    queryFn: () => fetchTaskAssignees(tenantId as string),
  })
}

/** Refresh all Tasks views after any trusted RPC write. */
export function useTasksInvalidate(tenantId: string | undefined) {
  const queryClient = useQueryClient()
  return () => {
    if (tenantId) void queryClient.invalidateQueries({ queryKey: tasksKeys.all(tenantId) })
  }
}

function useTaskMutation<T>(tenantId: string | undefined, mutationFn: (values: T) => Promise<unknown>) {
  const invalidate = useTasksInvalidate(tenantId)
  return useMutation({ mutationFn, onSuccess: invalidate })
}

export function useCreateTask(tenantId: string | undefined) {
  return useTaskMutation<TaskFormValues>(tenantId, (values) => createTask(tenantId as string, values))
}

export function useUpdateTask(tenantId: string | undefined) {
  return useTaskMutation<{ id: string; values: TaskFormValues }>(tenantId, ({ id, values }) =>
    updateTask(tenantId as string, id, values),
  )
}

export function useSetTaskStatus(tenantId: string | undefined) {
  return useTaskMutation<{ id: string; status: TaskStatus }>(tenantId, ({ id, status }) =>
    setTaskStatus(tenantId as string, id, status),
  )
}

export function useDeleteTask(tenantId: string | undefined) {
  return useTaskMutation<string>(tenantId, (id) => deleteTask(tenantId as string, id))
}
