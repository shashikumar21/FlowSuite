// Server-only helpers for tenant-owned Razorpay credentials.
// Keys are read from the encrypted per-tenant vault at request time. No key
// value is logged, returned to the browser, or stored in another table.

import { getVaultSecret, listVaultSecrets } from './vault.ts'

export type RazorpayTenantKeys = {
  keyId: string
  keySecret: string
  webhookSecret: string
}

const PROVIDER = 'razorpay'
const KEY_ID = 'RAZORPAY_KEY_ID'
const KEY_SECRET = 'RAZORPAY_KEY_SECRET'
const WEBHOOK_SECRET = 'RAZORPAY_WEBHOOK_SECRET'

/** Returns null unless all three keys are connected for this tenant. */
export async function getTenantRazorpayKeys(
  supabaseUrl: string,
  serviceRoleKey: string,
  encKey: string,
  tenantId: string,
): Promise<RazorpayTenantKeys | null> {
  const [keyId, keySecret, webhookSecret] = await Promise.all([
    getVaultSecret(supabaseUrl, serviceRoleKey, tenantId, PROVIDER, KEY_ID, encKey),
    getVaultSecret(supabaseUrl, serviceRoleKey, tenantId, PROVIDER, KEY_SECRET, encKey),
    getVaultSecret(supabaseUrl, serviceRoleKey, tenantId, PROVIDER, WEBHOOK_SECRET, encKey),
  ])
  if (!keyId || !keySecret || !webhookSecret) return null
  return { keyId, keySecret, webhookSecret }
}

/**
 * For signature-verified webhooks only: the tenant is unknown until the raw
 * body is authenticated, so every connected tenant webhook secret is tried.
 */
export async function listRazorpayWebhookSecrets(
  supabaseUrl: string,
  serviceRoleKey: string,
  encKey: string,
): Promise<Array<{ tenantId: string; secret: string }>> {
  const groups = await listVaultSecrets(supabaseUrl, serviceRoleKey, PROVIDER, encKey)
  return groups.flatMap((group) => {
    const secret = group.values[WEBHOOK_SECRET]
    return secret ? [{ tenantId: group.tenantId, secret }] : []
  })
}
