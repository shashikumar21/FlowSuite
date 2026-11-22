import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { getErrorMessage } from '@/lib/errors'
import type { TaskRow } from '@/types/database'
import { useCreateTask, useUpdateTask } from '../hooks'
import { emptyTaskForm, isoToLocalDateTime, localDateTimeToIso, taskFormSchema } from '../schemas'
import type { TaskAssigneeOption } from '../types'

export function TaskFormModal({
  open,
  onClose,
  tenantId,
  assignees,
  initial,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  assignees: TaskAssigneeOption[]
  initial?: TaskRow | null
  onSaved?: () => void
}) {
  const seed = initial ?? emptyTaskForm()
  const [title, setTitle] = useState(seed.title)
  const [description, setDescription] = useState(seed.description ?? '')
  const [assignedTo, setAssignedTo] = useState(seed.assigned_to ?? '')
  const [dueAt, setDueAt] = useState(isoToLocalDateTime(initial?.due_at))
  const [validationError, setValidationError] = useState<string | null>(null)

  const create = useCreateTask(tenantId)
  const update = useUpdateTask(tenantId)
  const pending = create.isPending || update.isPending
  const error = create.error ?? update.error

  const ownerOptions: TaskAssigneeOption[] = assignees.some((item) => item.user_id === assignedTo)
    ? assignees
    : assignedTo
      ? [{ user_id: assignedTo, full_name: null, role: 'inactive' }, ...assignees]
      : assignees

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setValidationError(null)

    const dueIso = localDateTimeToIso(dueAt)
    if (dueAt.trim() && !dueIso) {
      setValidationError('Enter a valid due date and time.')
      return
    }

    const parsed = taskFormSchema.safeParse({
      title,
      description: description || null,
      assigned_to: assignedTo || null,
      due_at: dueIso,
    })
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Check the form and try again.')
      return
    }
    try {
      if (initial) await update.mutateAsync({ id: initial.id, values: parsed.data })
      else await create.mutateAsync(parsed.data)
      onSaved?.()
      onClose()
    } catch {
      // The RPC error is rendered below; keep the form open for correction.
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!pending) onClose() }}
      title={initial ? 'Edit task' : 'New task'}
      description="Tasks are private to this business. No reminder or notification is sent."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Title</span>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Call the customer back" />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Owner</span>
            <Select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}>
              <option value="">Unassigned</option>
              {ownerOptions.map((owner) => (
                <option key={owner.user_id} value={owner.user_id}>
                  {owner.full_name ?? owner.user_id.slice(0, 8)}
                  {owner.role === 'inactive' ? ' (inactive)' : ''}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink-700">Due date and time</span>
            <Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-ink-700">Description (optional)</span>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Add the context needed to finish this task"
          />
        </label>

        {(validationError || error) ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {validationError ?? getErrorMessage(error)}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 border-t border-ink-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" loading={pending}>{initial ? 'Save changes' : 'Create task'}</Button>
        </div>
      </form>
    </Modal>
  )
}
