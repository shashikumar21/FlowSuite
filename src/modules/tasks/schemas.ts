import { z } from 'zod'

/**
 * Tasks form validation. These mirror the CHECK constraints in
 * 0022_tasks_module.sql. The RPCs remain the authoritative enforcement point:
 * no status, actor identity or completion timestamp is accepted from a client.
 */

export const taskStatuses = ['pending', 'in_progress', 'completed'] as const

const optionalText = (max: number) =>
  z.union([z.string().trim().max(max), z.null()]).transform((value) => value?.trim() || null)

export const taskFormSchema = z.object({
  title: z.string().trim()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or fewer'),
  description: optionalText(4000),
  assigned_to: z.union([z.string().uuid('Select a valid owner'), z.null()]),
  due_at: z.union([z.iso.datetime({ offset: true }), z.null()]),
})

export type TaskFormValues = z.infer<typeof taskFormSchema>

export const emptyTaskForm = (): TaskFormValues => ({
  title: '',
  description: null,
  assigned_to: null,
  due_at: null,
})

export const taskStatusUpdateSchema = z.object({
  task_id: z.string().uuid(),
  status: z.enum(taskStatuses),
})

export type TaskStatusUpdateValues = z.infer<typeof taskStatusUpdateSchema>

/** Convert a datetime-local input value into the ISO string the RPC expects. */
export function localDateTimeToIso(value: string): string | null {
  if (!value.trim()) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

/** Convert a stored ISO timestamp back into a datetime-local input value. */
export function isoToLocalDateTime(value: string | null | undefined): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const offset = parsed.getTimezoneOffset() * 60_000
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16)
}
