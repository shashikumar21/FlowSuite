import { useState } from 'react'
import { CalendarClock, CheckCircle2, ListTodo, Pencil, Play, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useTenant } from '@/app/providers/TenantProvider'
import { useToast } from '@/app/providers/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { getErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import type { TaskRow, TaskStatus } from '@/types/database'
import { TaskFormModal } from '../components/TaskFormModal'
import { useDeleteTask, useSetTaskStatus, useTaskAssignees, useTasks } from '../hooks'
import { buildTaskSummary, canManageTasks, taskStatusLabel, taskStatusVariant } from '../utils'

export function TasksPage() {
  const { activeTenant } = useTenant()
  const tenantId = activeTenant?.tenant_id
  const canManage = canManageTasks(activeTenant?.role)
  const { toast } = useToast()
  const tasksQuery = useTasks(tenantId)
  const assigneesQuery = useTaskAssignees(tenantId)
  const setStatus = useSetTaskStatus(tenantId)
  const deleteTask = useDeleteTask(tenantId)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<TaskRow | null>(null)

  if (!tenantId) return <ErrorState message="Select a business to manage its tasks." />

  const tasks = tasksQuery.data ?? []
  const assignees = assigneesQuery.data ?? []
  const ownerNames = new Map(assignees.map((owner) => [owner.user_id, owner.full_name ?? owner.user_id.slice(0, 8)]))
  const summary = buildTaskSummary(tasks)
  const refetch = () => {
    void tasksQuery.refetch()
    void assigneesQuery.refetch()
  }

  async function handleStatus(task: TaskRow, status: TaskStatus) {
    try {
      await setStatus.mutateAsync({ id: task.id, status })
      toast({ title: `Task marked ${taskStatusLabel(status).toLowerCase()}` })
    } catch (error) {
      toast({ title: 'Could not update task', description: getErrorMessage(error), variant: 'error' })
    }
  }

  async function handleDelete(task: TaskRow) {
    if (!canManage || !window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return
    try {
      await deleteTask.mutateAsync(task.id)
      toast({ title: 'Task deleted' })
    } catch (error) {
      toast({ title: 'Could not delete task', description: getErrorMessage(error), variant: 'error' })
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Tasks</h1>
          <p className="mt-1 text-sm text-ink-500">
            Assignments, owners and due dates for this business. No reminder or notification is sent.
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}>
          <Plus className="size-4" /> New task
        </Button>
      </header>

      {tasksQuery.isLoading || assigneesQuery.isLoading ? (
        <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>
      ) : tasksQuery.isError || assigneesQuery.isError ? (
        <ErrorState message={getErrorMessage(tasksQuery.error ?? assigneesQuery.error)} onRetry={refetch} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="p-5">
              <p className="text-xs font-medium text-ink-500">All tasks</p>
              <p className="mt-2 text-2xl font-bold text-ink-900">{summary.total}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium text-ink-500">Open</p>
              <p className="mt-2 text-2xl font-bold text-ink-900">{summary.open}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium text-ink-500">In progress</p>
              <p className="mt-2 text-2xl font-bold text-ink-900">{summary.inProgress}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium text-ink-500">Completed</p>
              <p className="mt-2 text-2xl font-bold text-ink-900">{summary.completed}</p>
            </Card>
          </div>

          {tasks.length === 0 ? (
            <Card>
              <EmptyState
                icon={<ListTodo className="size-5" />}
                title="No tasks yet"
                description="Create a task to track an assignment and its due date. Counts above come only from saved tasks."
                action={<Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" /> New task</Button>}
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <Card key={task.id}>
                  <CardContent className="space-y-3 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`font-semibold text-ink-900 ${task.status === 'completed' ? 'line-through opacity-60' : ''}`}>
                          {task.title}
                        </p>
                        {task.description ? <p className="mt-1 text-sm text-ink-700">{task.description}</p> : null}
                      </div>
                      <Badge variant={taskStatusVariant(task.status)}>{taskStatusLabel(task.status)}</Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-500">
                      <span>Owner: {task.assigned_to ? ownerNames.get(task.assigned_to) ?? 'Unknown member' : 'Unassigned'}</span>
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock className="size-3.5" />
                        {task.due_at ? formatDateTime(task.due_at) : 'No due date'}
                      </span>
                      {task.completed_at ? <span>Completed {formatDateTime(task.completed_at)}</span> : null}
                    </div>

                    <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 pt-3">
                      {task.status !== 'in_progress' && task.status !== 'completed' ? (
                        <Button variant="ghost" size="sm" onClick={() => void handleStatus(task, 'in_progress')} disabled={setStatus.isPending}>
                          <Play className="size-4" /> Start
                        </Button>
                      ) : null}
                      {task.status !== 'completed' ? (
                        <Button variant="ghost" size="sm" onClick={() => void handleStatus(task, 'completed')} disabled={setStatus.isPending}>
                          <CheckCircle2 className="size-4" /> Complete
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => void handleStatus(task, 'pending')} disabled={setStatus.isPending}>
                          <RotateCcw className="size-4" /> Reopen
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(task); setOpen(true) }}>
                        <Pencil className="size-4" /> Edit
                      </Button>
                      {canManage ? (
                        <Button variant="ghost" size="sm" onClick={() => void handleDelete(task)} disabled={deleteTask.isPending}>
                          <Trash2 className="size-4 text-red-600" /> Delete
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {open ? (
        <TaskFormModal
          key={editing?.id ?? 'new'}
          open
          onClose={() => { setOpen(false); setEditing(null) }}
          tenantId={tenantId}
          assignees={assignees}
          initial={editing}
          onSaved={refetch}
        />
      ) : null}
    </div>
  )
}
