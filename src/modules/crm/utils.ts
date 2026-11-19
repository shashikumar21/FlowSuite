import type { ActivityType, CrmMetrics, DealRow, StageRow } from '@/types/database'

/** DnD node ids are prefixed so deal ids can never collide with stage ids. */
export const STAGE_NODE_PREFIX = 'stage:'
export const DEAL_NODE_PREFIX = 'deal:'

/**
 * Resolves the stage a dragged deal was dropped onto. `over` may be either a
 * stage column or another deal card inside a column.
 */
export function resolveDropTarget(overId: string, deals: DealRow[]): string | null {
  if (overId.startsWith(STAGE_NODE_PREFIX)) return overId.slice(STAGE_NODE_PREFIX.length) || null
  if (overId.startsWith(DEAL_NODE_PREFIX)) {
    const dealId = overId.slice(DEAL_NODE_PREFIX.length)
    return deals.find((deal) => deal.id === dealId)?.stage_id ?? null
  }
  return null
}

export function groupDealsByStage<T extends DealRow>(deals: T[], stageIds: string[]): Record<string, T[]> {
  const grouped: Record<string, T[]> = {}
  for (const stageId of stageIds) grouped[stageId] = []
  for (const deal of deals) {
    if (!grouped[deal.stage_id]) grouped[deal.stage_id] = []
    grouped[deal.stage_id]?.push(deal)
  }
  for (const stageId of Object.keys(grouped)) {
    grouped[stageId]?.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  return grouped
}

export function stagesForPipeline(stages: StageRow[], pipelineId: string): StageRow[] {
  return stages
    .filter((stage) => stage.pipeline_id === pipelineId)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
}

export function barWidth(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)))
}

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  note: 'Note added',
  call: 'Call logged',
  email: 'Email sent',
  meeting: 'Meeting held',
  task: 'Task recorded',
  status_change: 'Status changed',
  stage_change: 'Deal moved',
  assignment: 'Assignment changed',
  lead_created: 'Lead created',
  deal_created: 'Deal created',
}

export function activityLabel(type: ActivityType): string {
  return ACTIVITY_LABELS[type] ?? 'Activity'
}

export const EMPTY_METRICS: CrmMetrics = {
  total_contacts: 0,
  new_leads: 0,
  qualified_leads: 0,
  open_deals: 0,
  won_deals: 0,
  open_pipeline_value: 0,
  leads_by_source: [],
  deals_by_stage: [],
  recent_activities: [],
}
