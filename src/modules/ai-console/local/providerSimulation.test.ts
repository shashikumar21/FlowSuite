import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addSimulatedConnection,
  loadSimulatedConnections,
  removeSimulatedConnection,
  simulationSecretNameSchema,
  simulationStorageKey,
  simulationWebhookUrl,
} from './providerSimulation'

const TENANT = '09902c67-e585-427c-98be-df91c211e864'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.get(key) ?? null }
  key(index: number) { return Array.from(this.data.keys())[index] ?? null }
  removeItem(key: string) { this.data.delete(key) }
  setItem(key: string, value: string) { this.data.set(key, value) }
}

describe('provider simulation (local dry run)', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    vi.spyOn(globalThis, 'fetch')
  })

  it('rejects client-visible and malformed secret names', () => {
    expect(simulationSecretNameSchema.safeParse('VITE_TOKEN').success).toBe(false)
    expect(simulationSecretNameSchema.safeParse('lowercase').success).toBe(false)
    expect(simulationSecretNameSchema.safeParse('OPENAI_API_KEY').success).toBe(true)
  })

  it('stores simulated metadata only, never a secret value', () => {
    const row = addSimulatedConnection(TENANT, 'openai', 'OPENAI_API_KEY', storage)
    expect(row).toMatchObject({
      provider: 'openai',
      secret_name: 'OPENAI_API_KEY',
      status: 'connected',
      mode: 'simulation',
    })
    expect(JSON.stringify(row)).not.toContain('sk-')
    expect(storage.getItem(simulationStorageKey(TENANT))).toContain('simulation')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('adds, deduplicates and removes connections for one tenant only', () => {
    addSimulatedConnection(TENANT, 'netlify', 'NETLIFY_DEPLOY_TOKEN', storage)
    const first = addSimulatedConnection(TENANT, 'netlify', 'NETLIFY_DEPLOY_TOKEN', storage)
    const second = addSimulatedConnection(TENANT, 'vercel', 'VERCEL_DEPLOY_TOKEN', storage)
    expect(first.id).toBe('sim-netlify-NETLIFY_DEPLOY_TOKEN')
    expect(loadSimulatedConnections(TENANT, storage)).toHaveLength(2)
    expect(loadSimulatedConnections('11111111-1111-4111-8111-111111111111', storage)).toHaveLength(0)

    removeSimulatedConnection(TENANT, second.provider, second.secret_name, storage)
    expect(loadSimulatedConnections(TENANT, storage).map((row) => row.provider)).toEqual(['netlify'])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('ignores corrupted stored data', () => {
    storage.setItem(simulationStorageKey(TENANT), '{not json')
    expect(loadSimulatedConnections(TENANT, storage)).toEqual([])
    storage.setItem(simulationStorageKey(TENANT), JSON.stringify([{ mode: 'live', status: 'connected' }]))
    expect(loadSimulatedConnections(TENANT, storage)).toEqual([])
  })

  it('uses a non-resolving documentation host for example webhooks', () => {
    expect(simulationWebhookUrl('https://example.supabase.co/functions/v1', 'whatsapp-webhook'))
      .toBe('https://local.invalid/functions/v1/whatsapp-webhook')
    expect(simulationWebhookUrl('', '../../evil')).toBe('https://local.invalid/functions/v1/evil')
  })
})
