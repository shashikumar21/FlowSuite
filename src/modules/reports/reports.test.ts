import { describe, expect, it } from 'vitest'
import navigationSource from '../../app/config/navigation.ts?raw'
import routerSource from '../../app/router/index.tsx?raw'
import { crmReportSchema, invoiceReportSchema } from './schemas'
import {
  buildInvoiceStatusBars,
  buildPaymentsReportSummary,
  EMPTY_CRM_REPORT,
  reportBarWidth,
} from './utils'

describe('reports navigation contract', () => {
  it('exposes an available Reports tab', () => {
    expect(navigationSource).toContain("{ label: 'Reports', to: '/app/reports'")
    expect(navigationSource).not.toContain("planned('Reports', 'reports', BarChart3)")
  })

  it('registers the Reports route', () => {
    expect(routerSource).toContain('<Route path="reports" element={<ReportsPage />} />')
  })
})

describe('report response schemas', () => {
  it('coerces numeric RPC values', () => {
    const parsed = crmReportSchema.parse({ ...EMPTY_CRM_REPORT, total_contacts: '12' })
    expect(parsed.total_contacts).toBe(12)
    expect(parsed.leads_by_source).toEqual([])
  })

  it('validates invoice rows before aggregation', () => {
    const parsed = invoiceReportSchema.parse({
      id: 'invoice-1',
      status: 'paid',
      total_amount: '999',
      amount_paid: '999',
      issue_date: '2026-11-24',
    })
    expect(parsed).toMatchObject({ total_amount: 999, amount_paid: 999 })
    expect(() => invoiceReportSchema.parse({ id: 'bad' })).toThrow()
  })
})

describe('report aggregation', () => {
  it('computes collected and outstanding amounts, excluding void invoices', () => {
    const summary = buildPaymentsReportSummary(
      [
        { id: 'a', status: 'paid', total_amount: 100, amount_paid: 100, issue_date: '2026-01-01' },
        { id: 'b', status: 'sent', total_amount: 200, amount_paid: 50, issue_date: '2026-01-02' },
        { id: 'c', status: 'void', total_amount: 500, amount_paid: 0, issue_date: '2026-01-03' },
      ],
      [
        { id: 'p1', invoice_id: 'a', amount: 100, paid_at: '2026-01-01' },
        { id: 'p2', invoice_id: 'b', amount: 50, paid_at: '2026-01-02' },
      ],
    )
    expect(summary).toEqual({
      collected: 150,
      outstanding: 150,
      invoiceCount: 2,
      paidInvoiceCount: 1,
    })
  })

  it('groups invoice statuses and scales bars safely', () => {
    const bars = buildInvoiceStatusBars([
      { id: 'a', status: 'paid', total_amount: 100, amount_paid: 100, issue_date: '2026-01-01' },
      { id: 'b', status: 'paid', total_amount: 200, amount_paid: 200, issue_date: '2026-01-02' },
      { id: 'c', status: 'void', total_amount: 500, amount_paid: 0, issue_date: '2026-01-03' },
    ])
    expect(bars.map((bar) => bar.label)).toEqual(['Paid', 'Void'])
    expect(bars[0]).toMatchObject({ value: 2, secondary: 300 })
    expect(reportBarWidth(5, 10)).toBe(50)
    expect(reportBarWidth(5, 0)).toBe(0)
  })
})
