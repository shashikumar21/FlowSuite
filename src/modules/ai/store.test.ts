import { describe, expect, it } from 'vitest'
import {
  createAiStore,
  createServiceClient,
  getWebsiteAgent,
} from '../../../supabase/functions/_shared/ai/store.ts'

describe('server store adapter', () => {
  it('exports injectable factories without reading env at import time', () => {
    expect(typeof createServiceClient).toBe('function')
    expect(typeof createAiStore).toBe('function')
    expect(typeof getWebsiteAgent).toBe('function')
  })
})
