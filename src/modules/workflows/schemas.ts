import { z } from 'zod'

export const workflowTriggerTypes = [
  'appointment_created',
  'appointment_cancelled',
  'appointment_rescheduled',
  'lead_created',
  'contact_created',
  'manual',
] as const

export const workflowStatuses = ['draft', 'active', 'paused'] as const
export const workflowActionTypes = ['create_task', 'notify_team', 'add_tag', 'webhook_placeholder'] as const

export const workflowActionSchema = z.object({
  type: z.enum(workflowActionTypes),
  label: z.string().trim().min(1, 'Action label is required').max(120),
  config: z.record(z.string(), z.string()),
})

export const workflowFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(500),
  trigger_type: z.enum(workflowTriggerTypes),
  status: z.enum(workflowStatuses),
  actions: z.array(workflowActionSchema).min(1, 'Add at least one action'),
})

export type WorkflowFormValues = z.infer<typeof workflowFormSchema>
