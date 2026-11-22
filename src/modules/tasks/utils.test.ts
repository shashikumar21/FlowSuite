import { describe, expect, it } from 'vitest'
import type { TaskRow, TaskStatus } from '@/types/database'
import { buildTaskSummary, canManageTasks, taskStatusLabel, taskStatusVariant } from './utils'

const task = (status: TaskStatus, assigned = true): TaskRow => ({
  id: `${status}-${assigned}`,
  tenant_id: '06a77082-53a2-4e9c-9c35-3214a76c9ba6',
  title: 'Example task',
  description: null,
  assigned_to: assigned ? '35e188c6-d0a2-434f-8a09-e5ea348aff80' : null,
  due_at: null,
  status,
  created_at: '2026-11-22T00:00:00.000Z',
  updated_at: '2026-11-22T00:00:00.000Z',
})

describe('Tasks utils', () => {
  it('derives counts only from the supplied rows', () => {
    const summary = buildTaskSummary([
      task('pending'),
      task('in_progress'),
      task('completed'),
      task('completed', false),
    ])
    expect(summary).toEqual({ total: 4, open: 2, inProgress: 1, completed: 2, unassigned: 1 })
    expect(buildTaskSummary([])).toEqual({ total: 0, open: 0, inProgress: 0, completed: 0, unassigned: 0 })
  })

  it('uses honest status labels and variants', () => {
    expect(taskStatusLabel('in_progress')).toBe('In progress')
    expect(taskStatusVariant('pending')).toBe('neutral')
    expect(taskStatusVariant('in_progress')).toBe('warning')
    expect(taskStatusVariant('completed')).toBe('success')
  })

  it('hints at delete permission only for owner/admin; server still rechecks', () => {
    expect(canManageTasks('owner')).toBe(true)
    expect(canManageTasks('admin')).toBe(true)
    expect(canManageTasks('manager')).toBe(false)
    expect(canManageTasks('employee')).toBe(false)
    expect(canManageTasks(undefined)).toBe(false)
  })
})
