// Server-only vault helpers. Decrypts integration_secrets ciphertext encrypted
// by integrations-vault-save using CREDENTIALS_ENCRYPTION_KEY (AES-GCM, SHA-256 key).

import { createServiceClient } from './ai/store.ts'

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const buffer = new ArrayBuffer(bin.length)
  const out = new Uint8Array(buffer)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['decrypt'])
}

export async function decryptVaultSecret(ciphertext: string, iv: string, encKey: string): Promise<string> {
  const key = await deriveKey(encKey)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(iv) }, key, b64ToBytes(ciphertext))
  return new TextDecoder().decode(plain)
}

export async function getVaultSecret(
  supabaseUrl: string,
  serviceRoleKey: string,
  tenantId: string,
  provider: string,
  secretName: string,
  encKey: string,
): Promise<string | null> {
  const admin = createServiceClient(supabaseUrl, serviceRoleKey)
  const { data, error } = await admin
    .from('integration_secrets')
    .select('ciphertext, iv, status')
    .eq('tenant_id', tenantId)
    .eq('provider', provider)
    .eq('secret_name', secretName)
    .maybeSingle<{ ciphertext: string; iv: string; status: string }>()
  if (error) throw error
  if (!data || data.status !== 'connected' || !data.ciphertext || !data.iv) return null
  return decryptVaultSecret(data.ciphertext, data.iv, encKey)
}

export type VaultSecretGroup = {
  tenantId: string
  values: Record<string, string>
}

/**
 * Decrypts all connected secrets for one provider, grouped by tenant. Omitting
 * tenantId is only safe in a signature-verified webhook: it is used to find the
 * tenant whose webhook secret matches an incoming provider signature. Rows that
 * cannot be decrypted are skipped; secret values are never logged.
 */
export async function listVaultSecrets(
  supabaseUrl: string,
  serviceRoleKey: string,
  provider: string,
  encKey: string,
  tenantId?: string,
): Promise<VaultSecretGroup[]> {
  const admin = createServiceClient(supabaseUrl, serviceRoleKey)
  let query = admin
    .from('integration_secrets')
    .select('tenant_id, secret_name, ciphertext, iv, status')
    .eq('provider', provider)
    .eq('status', 'connected')
  if (tenantId) query = query.eq('tenant_id', tenantId)

  const { data, error } = await query
  if (error) throw error

  type Row = { tenant_id: string; secret_name: string; ciphertext: string; iv: string };
  const groups = new Map<string, Record<string, string>>()
  for (const row of (data ?? []) as Row[]) {
    if (!row.ciphertext || !row.iv || !row.secret_name) continue
    let value: string
    try {
      value = await decryptVaultSecret(row.ciphertext, row.iv, encKey)
    } catch {
      continue
    }
    if (!value) continue
    const values = groups.get(row.tenant_id) ?? {}
    values[row.secret_name] = value
    groups.set(row.tenant_id, values)
  }
  return Array.from(groups, ([groupTenantId, values]) => ({ tenantId: groupTenantId, values }))
}
