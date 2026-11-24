import { describe, expect, it } from 'vitest'
import migrationSql from '../../../supabase/migrations/0048_payments_razorpay_invoice_collection.sql?raw'
import createFn from '../../../supabase/functions/invoice-payment-create/index.ts?raw'
import verifyFn from '../../../supabase/functions/invoice-payment-verify/index.ts?raw'
import webhookFn from '../../../supabase/functions/invoice-payment-webhook/index.ts?raw'
import tenantKeys from '../../../supabase/functions/_shared/billingTenant.ts?raw'
import gatewayApi from './gatewayApi.ts?raw'

/**
 * Static contract checks. The Deno runtime and a local Postgres are not part of
 * the Vitest suite, so hosted promotion still needs its own approval-gated test.
 */

function block(sql: string, start: string, end: string): string {
  const from = sql.indexOf(start)
  const to = sql.indexOf(end, from + start.length)
  if (from < 0 || to < 0) throw new Error(`Missing SQL block: ${start} -> ${end}`)
  return sql.slice(from, to)
}

describe('tenant-owned Razorpay invoice collection contract', () => {
  it('keeps order and webhook tables tenant-scoped with no client writes', () => {
    expect(migrationSql).toContain('LOCAL ONLY')
    const orders = block(migrationSql, 'create table if not exists public.invoice_payment_orders', 'create index if not exists invoice_payment_orders_tenant_idx')
    expect(orders).toContain('tenant_id uuid not null references public.businesses(id) on delete cascade')
    expect(orders).toContain('provider_order_id text not null unique')
    expect(orders).toContain('foreign key (invoice_id, tenant_id) references public.invoices(id, tenant_id)')
    expect(orders).toContain('check (amount_paise > 0)')
    expect(migrationSql).toContain('alter table public.invoice_payment_orders enable row level security')
    expect(migrationSql).toContain('revoke all on public.invoice_payment_orders from public, anon, authenticated')
    expect(migrationSql).not.toMatch(/create\s+policy[^\n]*invoice_payment_orders/i)

    const ledger = block(migrationSql, 'create table if not exists public.invoice_payment_webhook_events', '-- 4. Tenant-scoped read RPCs')
    expect(ledger).toContain('provider_event_id text not null unique')
    expect(ledger).toContain('tenant_id uuid references public.businesses(id) on delete cascade')
    expect(migrationSql).toContain('revoke all on public.invoice_payment_webhook_events from public, anon, authenticated')
  })

  it('replaces the legacy payment-method check instead of stacking a second one', () => {
    const enums = block(migrationSql, '-- 1. Extend existing enums', '-- 2. Orders created for an invoice')
    expect(enums).toContain("t.relname = 'invoice_payments'")
    expect(enums).toContain("like '%method%'")
    expect(enums).toContain('drop constraint %I')
    expect(enums).toContain("'razorpay'")
    expect(enums).toContain("t.relname = 'integration_secrets'")
    expect(enums).toContain("like '%provider%'")
  })

  it('exposes only metadata to tenant members', () => {
    const status = block(migrationSql, 'create or replace function public.payments_gateway_status', 'create or replace function public.payments_list_invoice_orders')
    expect(status).toContain('public.has_tenant_access(p_tenant)')
    const statusOutput = block(status, 'return jsonb_build_object(', 'end;')
    expect(statusOutput).not.toMatch(/ciphertext|\biv\b|secret_value/i)

    const list = block(migrationSql, 'create or replace function public.payments_list_invoice_orders', '-- 5. Service-role RPCs')
    expect(list).toContain('public.has_tenant_access(p_tenant)')
    expect(list).toContain('i.tenant_id = p_tenant')
    expect(list).not.toMatch(/ciphertext|\biv\b|secret_value/i)
    expect(migrationSql).toContain('grant execute on function public.payments_gateway_status(uuid) to authenticated')
    expect(migrationSql).toContain('grant execute on function public.payments_list_invoice_orders(uuid, uuid) to authenticated')
  })

  it('restricts every write RPC to service_role with explicit anon revokes', () => {
    const names = [
      'payments_service_create_invoice_order',
      'payments_service_record_online_payment',
      'payments_service_mark_invoice_order_failed',
      'payments_service_record_invoice_webhook_event',
      'payments_service_finish_invoice_webhook_event',
    ]
    for (const name of names) {
      const fn = block(migrationSql, `create or replace function public.${name}`, '$$;')
      expect(fn).toContain("auth.role()) is distinct from 'service_role'")
      expect(migrationSql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated`))
      expect(migrationSql).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to service_role`))
    }
  })

  it('checks the invoice balance and records verified payments idempotently', () => {
    const create = block(migrationSql, 'create or replace function public.payments_service_create_invoice_order', 'create or replace function public.payments_service_record_online_payment')
    expect(create).toContain('for update')
    expect(create).toContain('i.tenant_id = p_tenant')
    expect(create).toContain('p_amount_paise <> v_due_paise')
    expect(create).not.toMatch(/ciphertext|key_secret|webhook_secret/i)

    const record = block(migrationSql, 'create or replace function public.payments_service_record_online_payment', 'create or replace function public.payments_service_mark_invoice_order_failed')
    expect(record).toContain('v_order.tenant_id <> p_tenant')
    expect(record).toContain("where tenant_id = p_tenant and reference = v_reference")
    expect(record).toContain("'razorpay'")
    expect(record).toContain('payments_refresh_invoice_status')
    expect(record).toContain('payments.invoice_paid_online')
    expect(record).not.toMatch(/key_secret|webhook_secret|ciphertext/i)
  })

  it('reads tenant keys from the encrypted vault, never from global env', () => {
    expect(createFn).toContain("req.headers.get('authorization')")
    expect(createFn).toContain('supabase.auth.getUser(token)')
    expect(createFn).toContain("['owner', 'admin', 'manager']")
    expect(createFn).toContain('getTenantRazorpayKeys')
    expect(createFn).toContain('payments_service_create_invoice_order')
    expect(createFn).not.toContain("Deno.env.get('RAZORPAY_KEY_ID')")
    expect(createFn).not.toContain("Deno.env.get('RAZORPAY_KEY_SECRET')")

    expect(verifyFn).toContain('verifyPaymentSignature(keys.keySecret')
    expect(verifyFn).toContain('payments_service_record_online_payment')
    expect(verifyFn).toContain('orderResult.data.tenant_id !== tenant_id')
    expect(verifyFn).not.toContain("Deno.env.get('RAZORPAY_KEY_SECRET')")

    expect(tenantKeys).toContain('getVaultSecret')
    expect(tenantKeys).toContain('listVaultSecrets')
    expect(tenantKeys).not.toMatch(/console\.(log|warn|error)/)
  })

  it('verifies the webhook signature before parsing and scopes tenants by HMAC', () => {
    expect(webhookFn).toContain('verify_jwt=false')
    expect(webhookFn).toContain('listRazorpayWebhookSecrets')
    expect(webhookFn).toContain('verifyWebhookSignature(candidate.secret, rawBody, signature)')
    expect(webhookFn.indexOf('verifyWebhookSignature(candidate.secret')).toBeLessThan(webhookFn.indexOf('JSON.parse(rawBody)'))
    expect(webhookFn).toContain('payments_service_record_invoice_webhook_event')
    expect(webhookFn).toContain('payments_service_record_online_payment')
    expect(webhookFn).not.toContain("Deno.env.get('RAZORPAY_WEBHOOK_SECRET')")
  })

  it('never returns secret values to the browser', () => {
    expect(gatewayApi).toContain("functions.invoke('invoice-payment-create'")
    expect(gatewayApi).toContain("functions.invoke('invoice-payment-verify'")
    expect(gatewayApi).toContain("functions.invoke('integrations-vault-save'")
    expect(gatewayApi).not.toMatch(/key_id:|key_secret:|webhook_secret:/)
  })
})
