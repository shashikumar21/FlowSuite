import { describe, expect, it } from 'vitest'
import {
  dashboardBookingSnapshotSchema,
  dashboardCrmSnapshotSchema,
  dashboardInboxSnapshotSchema,
} from './schemas'

describe('dashboard snapshot schemas', () => {
  const crmInput = {
    total_contacts: '9',
    open_deals: '3',
    open_pipeline_value: '27700',
    leads_by_source: [{ label: 'Website', count: '4' }],
    deals_by_stage: [{ stage: 'Qualified', count: '2', value: '12000', position: 1 }],
  }

  it('coerces numeric RPC values and keeps chart breakdowns', () => {
    const parsed = dashboardCrmSnapshotSchema.parse(crmInput)
    expect(parsed).toMatchObject({
      total_contacts: 9,
      open_deals: 3,
      open_pipeline_value: 27700,
    })
    expect(parsed.leads_by_source).toEqual([{ label: 'Website', count: 4 }])
    expect(parsed.deals_by_stage).toEqual([{ stage: 'Qualified', count: 2, value: 12000 }])
  })

  it('accepts empty breakdown arrays when a tenant has no pipeline data', () => {
    const parsed = dashboardCrmSnapshotSchema.parse({
      total_contacts: 0,
      open_deals: 0,
      open_pipeline_value: 0,
      leads_by_source: [],
      deals_by_stage: [],
    })
    expect(parsed.leads_by_source).toEqual([])
    expect(parsed.deals_by_stage).toEqual([])
  })

  it('rejects negative counts instead of charting impossible values', () => {
    expect(() => dashboardCrmSnapshotSchema.parse({ ...crmInput, open_deals: -1 })).toThrow()
  })

  it('validates booking and inbox RPC fields', () => {
    expect(
      dashboardBookingSnapshotSchema.parse({
        today_count: '1',
        week_count: '2',
        upcoming_count: '3',
        pending_count: '4',
        completed_count: '5',
        cancelled_count: '0',
        no_show_count: '0',
      }),
    ).toMatchObject({ today_count: 1, week_count: 2, upcoming_count: 3 })

    expect(
      dashboardInboxSnapshotSchema.parse({
        open_count: '6',
        pending_count: '1',
        closed_count: '2',
        unassigned_count: '0',
      }),
    ).toEqual({ open_count: 6, pending_count: 1, closed_count: 2, unassigned_count: 0 })
  })
})
