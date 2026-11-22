export type WorkflowStatus = 'draft' | 'active' | 'paused'
export type WorkflowTriggerType =
  | 'appointment_created'
  | 'appointment_cancelled'
  | 'appointment_rescheduled'
  | 'lead_created'
  | 'contact_created'
  | 'manual'

export type WorkflowActionType = 'create_task' | 'notify_team' | 'add_tag' | 'webhook_placeholder'

export interface WorkflowAction {
  type: WorkflowActionType
  label: string
  config: Record<string, string>
}

export interface WorkflowRow {
  id: string
  tenant_id: string
  name: string
  description: string | null
  trigger_type: WorkflowTriggerType
  trigger_config: Record<string, unknown>
  actions: WorkflowAction[]
  status: WorkflowStatus
  run_count: number
  last_run_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}
