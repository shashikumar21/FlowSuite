import { z } from 'zod'

const count = z.coerce.number().finite().nonnegative()
const amount = z.coerce.number().finite()

export const dashboardLeadSourceSchema = z.object({
  label: z.string().min(1),
  count,
})

export const dashboardPipelineStageSchema = z.object({
  stage: z.string().min(1),
  count,
  value: amount,
})

/** Validates only the CRM fields the Dashboard chart consumes. */
export const dashboardCrmSnapshotSchema = z.object({
  total_contacts: count,
  open_deals: count,
  open_pipeline_value: amount,
  leads_by_source: z.array(dashboardLeadSourceSchema),
  deals_by_stage: z.array(dashboardPipelineStageSchema),
})

/** Validates the booking RPC fields used by the Dashboard. */
export const dashboardBookingSnapshotSchema = z.object({
  today_count: count,
  week_count: count,
  upcoming_count: count,
  pending_count: count,
  completed_count: count,
  cancelled_count: count,
  no_show_count: count,
})

/** Validates the inbox RPC fields used by the Dashboard. */
export const dashboardInboxSnapshotSchema = z.object({
  open_count: count,
  pending_count: count,
  closed_count: count,
  unassigned_count: count,
})

export type DashboardLeadSource = z.infer<typeof dashboardLeadSourceSchema>
export type DashboardPipelineStage = z.infer<typeof dashboardPipelineStageSchema>
export type DashboardCrmSnapshot = z.infer<typeof dashboardCrmSnapshotSchema>
