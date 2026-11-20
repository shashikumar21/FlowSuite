// Server-only provider selection. Secrets are injected by the Edge Function;
// this module never reads Deno.env and never falls back to a second vendor.

import { AiNotConfiguredError } from '../../../../src/modules/ai/providers/errors.ts';
import { OpenAiProvider } from '../../../../src/modules/ai/providers/openai.ts';
import type { AiProvider } from '../../../../src/modules/ai/providers/types.ts';

export interface AiProviderEnv {
  AI_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
  AI_TIMEOUT_MS?: string;
  AI_MAX_RETRIES?: string;
}

export interface AiProviderOptions {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

function positiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Returns a vendor-neutral AiProvider. With no configured key this throws, so
 * a partially configured deployment cannot make a live provider call.
 */
export function createAiProvider(env: AiProviderEnv, options: AiProviderOptions = {}): AiProvider {
  const selected = (env.AI_PROVIDER ?? 'openai').trim().toLowerCase();
  if (selected !== 'openai') {
    throw new AiNotConfiguredError(`Unsupported AI provider: ${selected}`);
  }
  if (!env.OPENAI_API_KEY?.trim()) {
    throw new AiNotConfiguredError('OpenAI');
  }

  return new OpenAiProvider({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL?.trim() || undefined,
    baseUrl: env.OPENAI_BASE_URL?.trim() || undefined,
    timeoutMs: positiveInt(env.AI_TIMEOUT_MS),
    maxRetries: positiveInt(env.AI_MAX_RETRIES),
    fetchImpl: options.fetchImpl,
    sleep: options.sleep,
  });
}
