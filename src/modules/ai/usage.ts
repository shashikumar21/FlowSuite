import type { AiChannel, AiOperation } from '@/types/database'
import { AiProviderError } from './providers/errors.ts'
import type { AiCompletion } from './providers/types.ts'

/** Injected by the Edge Function: wraps the service-role ai_check_usage_limit RPC. */
export type UsageLimitChecker = (tenantId: string, agentId: string) => Promise<boolean>

/** Injected by the Edge Function: wraps the service-role ai_record_usage RPC. */
export type UsageRecorder = (record: UsageRecord) => Promise<void>

export interface UsageRecord {
  tenantId: string
  agentId: string | null
  conversationId: string | null
  channel: AiChannel
  provider: string
  model: string
  operation: AiOperation
  promptTokens: number | null
  completionTokens: number | null
  estimatedCost: number | null
  latencyMs: number | null
  success: boolean | null
  errorCode: string | null
  requestId: string | null
}

/**
 * Fails closed before any provider call when the tenant has no allowance left.
 * The DB RPC is authoritative; this helper only translates its boolean.
 */
export async function requireUsageAllowance(
  tenantId: string,
  agentId: string,
  check: UsageLimitChecker
): Promise<void> {
  const allowed = await check(tenantId, agentId)
  if (!allowed) {
    throw new AiProviderError('Monthly AI token limit reached for this agent', {
      code: 'rate_limited',
      status: 429,
    })
  }
}

export function buildUsageRecord(options: {
  tenantId: string
  agentId: string | null
  conversationId: string | null
  channel: AiChannel
  operation: AiOperation
  provider: string
  completion?: AiCompletion
  errorCode?: string | null
  requestId?: string | null
}): UsageRecord {
  const { completion } = options
  return {
    tenantId: options.tenantId,
    agentId: options.agentId,
    conversationId: options.conversationId,
    channel: options.channel,
    operation: options.operation,
    provider: options.provider,
    model: completion?.model ?? '',
    promptTokens: completion?.usage.promptTokens ?? null,
    completionTokens: completion?.usage.completionTokens ?? null,
    estimatedCost: completion?.usage.estimatedCostUsd ?? null,
    latencyMs: completion?.latencyMs ?? null,
    success: completion ? true : false,
    errorCode: options.errorCode ?? null,
    requestId: options.requestId ?? completion?.requestId ?? null,
  }
}
