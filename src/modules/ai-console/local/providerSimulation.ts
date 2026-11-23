import { z } from 'zod'

// Local-only provider connection dry run. This module deliberately:
// * never imports the Supabase client or calls an Edge Function;
// * never accepts or stores a real secret value;
// * keeps state in sessionStorage so nothing survives the browser session.
// It is a UI/runtime rehearsal, not a connected provider.

export const simulationProviders = ['openai', 'whatsapp', 'resend', 'exotel', 'netlify', 'vercel', 'other'] as const

export const simulationProviderSchema = z.enum(simulationProviders)

export const simulationSecretNameSchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{2,199}$/, 'Use an UPPERCASE secret name with letters, digits and underscores only.')
  .refine((name) => !name.startsWith('VITE_'), 'VITE_ names are client-visible and are not allowed.')

export type SimulatedConnection = {
  id: string
  provider: z.infer<typeof simulationProviderSchema>
  secret_name: string
  status: 'connected'
  updated_at: string
  mode: 'simulation'
}

const STORAGE_PREFIX = 'flowsuite.local.integrations.'

export function simulationStorageKey(tenantId: string): string {
  return `${STORAGE_PREFIX}${tenantId}`
}

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function loadSimulatedConnections(tenantId: string, storage: Storage | null = getStorage()): SimulatedConnection[] {
  if (!storage) return []
  try {
    const raw = storage.getItem(simulationStorageKey(tenantId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is SimulatedConnection => {
      if (!item || typeof item !== 'object') return false
      const row = item as Partial<SimulatedConnection>
      return row.mode === 'simulation'
        && row.status === 'connected'
        && typeof row.id === 'string'
        && typeof row.secret_name === 'string'
        && simulationProviderSchema.safeParse(row.provider).success
        && typeof row.updated_at === 'string'
    })
  } catch {
    return []
  }
}

function persist(tenantId: string, rows: SimulatedConnection[], storage: Storage | null): SimulatedConnection[] {
  if (!storage) return rows
  try {
    storage.setItem(simulationStorageKey(tenantId), JSON.stringify(rows))
  } catch {
    // Storage can be disabled; the in-memory return value still updates the UI.
  }
  return rows
}

export function addSimulatedConnection(
  tenantId: string,
  provider: string,
  secretName: string,
  storage: Storage | null = getStorage(),
): SimulatedConnection {
  const safeProvider = simulationProviderSchema.parse(provider)
  const safeSecretName = simulationSecretNameSchema.parse(secretName)
  const rows = loadSimulatedConnections(tenantId, storage)
  const existing = rows.find((row) => row.provider === safeProvider && row.secret_name === safeSecretName)
  if (existing) return existing

  const row: SimulatedConnection = {
    id: `sim-${safeProvider}-${safeSecretName}`,
    provider: safeProvider,
    secret_name: safeSecretName,
    status: 'connected',
    updated_at: new Date().toISOString(),
    mode: 'simulation',
  }
  persist(tenantId, [row, ...rows], storage)
  return row
}

export function removeSimulatedConnection(
  tenantId: string,
  provider: string,
  secretName: string,
  storage: Storage | null = getStorage(),
): void {
  const rows = loadSimulatedConnections(tenantId, storage)
    .filter((row) => !(row.provider === provider && row.secret_name === secretName))
  persist(tenantId, rows, storage)
}

export function simulationWebhookUrl(_functionBase: string, endpoint: string): string {
  const safeEndpoint = endpoint.replace(/[^a-z0-9-]/gi, '') || 'webhook'
  // local.invalid is reserved for documentation/simulation and can never resolve.
  return `https://local.invalid/functions/v1/${safeEndpoint}`
}
