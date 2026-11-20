import { OpenAiProvider } from './openai'
import type { AiProvider, AiProviderConfig } from './types'

export * from './errors'
export * from './openai'
export * from './pricing'
export * from './retry'
export * from './types'

export type AiProviderName = 'openai'

/**
 * Server-side factory. The API key must be supplied from a server secret
 * (e.g. Deno.env.get('OPENAI_API_KEY') in an Edge Function). Never call this
 * from browser code and never pass a VITE_* value.
 *
 * Fail-closed: an absent or blank key throws, so no provider is silently
 * replaced with a fake or console implementation.
 */
export function createAiProvider(
  name: AiProviderName,
  config: AiProviderConfig
): AiProvider {
  switch (name) {
    case 'openai':
      return new OpenAiProvider(config)
    default:
      throw new Error(`Unsupported AI provider: ${name satisfies never}`)
  }
}
