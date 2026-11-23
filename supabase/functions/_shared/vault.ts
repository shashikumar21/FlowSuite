// Server-only vault helpers. Decrypts integration_secrets ciphertext encrypted
// by integrations-vault-save using CREDENTIALS_ENCRYPTION_KEY (AES-GCM, SHA-256 key).

import { createServiceClient } from './ai/store.ts'

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
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
