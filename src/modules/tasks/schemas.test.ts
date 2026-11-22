import { describe, expect, it } from 'vitest'
import {
  emptyTaskForm,
  isoToLocalDateTime,
  localDateTimeToIso,
  taskFormSchema,
  taskStatusUpdateSchema,
} from './schemas'

const validTask = () => ({
  ...emptyTaskForm(),
  title: 'Call the customer back',
  description: 'Confirm the appointment time.',
  assigned_to: '35e188c6-d0a2-434f-8a09-e5ea348aff80',
  due_at: '2026-12-01T09:00:00.000Z',
})

describe('Tasks schemas', () => {
  it('accepts a valid task and rejects empty or oversized fields', () => {
    expect(taskFormSchema.safeParse(validTask()).success).toBe(true)
    expect(taskFormSchema.safeParse({ ...validTask(), title: '' }).success).toBe(false)
    expect(taskFormSchema.safeParse({ ...validTask(), title: 'x'.repeat(201) }).success).toBe(false)
    expect(taskFormSchema.safeParse({ ...validTask(), description: 'x'.repeat(4001) }).success).toBe(false)
  })

  it('validates owner UUIDs and ISO due dates', () => {
    expect(taskFormSchema.safeParse({ ...validTask(), assigned_to: null }).success).toBe(true)
    expect(taskFormSchema.safeParse({ ...validTask(), assigned_to: 'not-a-uuid' }).success).toBe(false)
    expect(taskFormSchema.safeParse({ ...validTask(), due_at: null }).success).toBe(true)
    expect(taskFormSchema.safeParse({ ...validTask(), due_at: '01/12/2026' }).success).toBe(false)
    expect(taskFormSchema.safeParse({ ...validTask(), due_at: '2026-12-01T09:00' }).success).toBe(false)
  })

  it('only accepts the three real task statuses', () => {
    const id = '35e188c6-d0a2-434f-8a09-e5ea348aff80'
    expect(taskStatusUpdateSchema.safeParse({ task_id: id, status: 'in_progress' }).success).toBe(true)
    expect(taskStatusUpdateSchema.safeParse({ task_id: id, status: 'sent' }).success).toBe(false)
    expect(taskStatusUpdateSchema.safeParse({ task_id: 'nope', status: 'completed' }).success).toBe(false)
  })

  it('has no provider, actor, role or completion timestamp field', () => {
    const forbidden = /provider|send|deliver|created_by|completed_by|completed_at|role|permission/i
    expect(Object.keys(validTask()).some((key) => forbidden.test(key))).toBe(false)
    expect(Object.keys(emptyTaskForm()).some((key) => forbidden.test(key))).toBe(false)
  })

  it('converts between datetime-local inputs and stored ISO timestamps', () => {
    expect(localDateTimeToIso('')).toBeNull()
    expect(localDateTimeToIso('not-a-date')).toBeNull()
    expect(localDateTimeToIso('2026-12-01T09:00')).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
    expect(isoToLocalDateTime(null)).toBe('')
    expect(isoToLocalDateTime('not-a-date')).toBe('')
    expect(isoToLocalDateTime('2026-12-01T09:00:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })
})
