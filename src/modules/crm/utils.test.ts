import { describe, expect, it } from 'vitest'
import type { DealRow, StageRow } from '@/types/database'
import { activityLabel, barWidth, groupDealsByStage, resolveDropTarget, stagesForPipeline, STAGE_NODE_PREFIX, DEAL_NODE_PREFIX } from './utils'

function deal(id: string, stageId: string, createdAt = '2026-01-01T00:00:00Z'): DealRow {
  return {
    id,
    tenant_id: 'tenant',
    contact_id: 'contact',
    pipeline_id: 'pipeline',
    stage_id: stageId,
    title: `Deal ${id}`,
    value: 1000,
    currency: 'INR',
    assigned_to: null,
    status: 'open',
    expected_close_date: null,
    description: null,
    probability: 0,
    custom_data: {},
    won_at: null,
    lost_at: null,
    lost_reason: null,
    created_at: createdAt,
    updated_at: createdAt,
  }
}

function stage(id: string, pipelineId: string, position: number): StageRow {
  return {
    id,
    tenant_id: 'tenant',
    pipeline_id: pipelineId,
    name: `Stage ${position}`,
    position,
    probability: position * 10,
    is_closed: false,
    is_won: false,
    color: null,
    slug: null,
  }
}

describe('CRM Kanban utilities', () => {
  const deals = [deal('d1', 's2', '2026-01-02T00:00:00Z'), deal('d2', 's1', '2026-01-01T00:00:00Z')]

  it('resolves drops on both stage columns and deal cards', () => {
    expect(resolveDropTarget(`${STAGE_NODE_PREFIX}s1`, deals)).toBe('s1')
    expect(resolveDropTarget(`${DEAL_NODE_PREFIX}d1`, deals)).toBe('s2')
    expect(resolveDropTarget('unknown', deals)).toBeNull()
    expect(resolveDropTarget(`${DEAL_NODE_PREFIX}missing`, deals)).toBeNull()
  })

  it('groups deals under every stage, newest first, without losing deals', () => {
    const grouped = groupDealsByStage(deals, ['s1', 's2', 's3'])
    expect(Object.keys(grouped)).toEqual(['s1', 's2', 's3'])
    expect(grouped['s1']?.map((item) => item.id)).toEqual(['d2'])
    expect(grouped['s2']?.map((item) => item.id)).toEqual(['d1'])
    expect(grouped['s3']).toEqual([])
  })

  it('orders stages of one pipeline by position', () => {
    const stages = [stage('s2', 'p1', 2), stage('s1', 'p1', 1), stage('other', 'p2', 0)]
    expect(stagesForPipeline(stages, 'p1').map((item) => item.id)).toEqual(['s1', 's2'])
  })

  it('clamps semantic bar widths and survives empty data', () => {
    expect(barWidth(5, 10)).toBe(50)
    expect(barWidth(20, 10)).toBe(100)
    expect(barWidth(-2, 10)).toBe(0)
    expect(barWidth(1, 0)).toBe(0)
  })

  it('provides readable labels for system-generated activities', () => {
    expect(activityLabel('stage_change')).toBe('Deal moved')
    expect(activityLabel('note')).toBe('Note added')
  })
})
