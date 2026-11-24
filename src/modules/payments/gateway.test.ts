import { describe, expect, it } from 'vitest'
import {
  createInvoicePaymentResultSchema,
  gatewayStatusSchema,
  invoiceBalancePaise,
  invoiceReceipt,
  razorpayCredentialSchema,
} from './gateway'

describe('invoice gateway helpers', () => {
  it('builds a short, safe Razorpay receipt from tenant and invoice ids', () => {
    const receipt = invoiceReceipt('09902c67-e585-427c-98be-df91c211e864', '4858b4f6-3c9b-4c4d-a0a5-73d3fe303176')
    expect(receipt).toMatch(/^fs_[A-Za-z0-9_-]+$/)
    expect(receipt.length).toBeLessThanOrEqual(40)
  })

  it('converts the invoice balance to integer paise and rejects a zero balance', () => {
    expect(invoiceBalancePaise(1000.5, 250.25)).toBe(75025)
    expect(() => invoiceBalancePaise(100, 100)).toThrow()
    expect(() => invoiceBalancePaise(Number.NaN, 0)).toThrow()
  })

  it('parses gateway status and rejects unknown fields conservatively', () => {
    expect(gatewayStatusSchema.parse({ configured: true, keys_configured: true, webhook_configured: true })).toEqual({
      configured: true,
      keys_configured: true,
      webhook_configured: true,
    })
    expect(() => gatewayStatusSchema.parse({ configured: 'yes' })).toThrow()
  })

  it('requires a public key id before opening checkout', () => {
    const valid = {
      ok: true,
      order_id: 'order_1',
      key_id: 'rzp_test_public',
      amount_paise: 10000,
      currency: 'INR',
      receipt: 'fs_tenant_invoice',
      invoice_id: '4858b4f6-3c9b-4c4d-a0a5-73d3fe303176',
    }
    expect(createInvoicePaymentResultSchema.parse(valid).key_id).toBe('rzp_test_public')
    const withoutKey = { ...valid } as Record<string, unknown>
    delete withoutKey.key_id
    expect(() => createInvoicePaymentResultSchema.parse(withoutKey)).toThrow()
  })

  it('requires all three tenant-owned credentials', () => {
    const valid = { keyId: 'rzp_test_public', keySecret: 'secret', webhookSecret: 'whsec' }
    expect(razorpayCredentialSchema.parse(valid)).toEqual(valid)
    expect(() => razorpayCredentialSchema.parse({ ...valid, webhookSecret: '' })).toThrow()
  })
})
