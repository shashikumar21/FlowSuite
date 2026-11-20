import type { AiLanguage, AiToolKey } from '@/types/database'
import { TOOL_SCHEMAS, type ToolInputMap } from './schemas'

/** Mirrors the CHECK constraint on public.ai_agent_tools in migration 0014. */
export const TOOL_ALLOWLIST: readonly AiToolKey[] = [
  'answer_faq',
  'qualify_lead',
  'lookup_services',
  'lookup_hours',
  'lookup_availability',
  'create_booking',
  'create_lead',
  'check_consent',
  'send_reply',
  'handoff',
]

export const MUTATING_TOOLS: readonly AiToolKey[] = [
  'qualify_lead',
  'create_booking',
  'create_lead',
  'send_reply',
  'handoff',
]

export interface ToolContext {
  /** Always required. Handlers must use this for tenant-scoped RPC calls. */
  tenantId: string
  agentId: string
  conversationId?: string
  contactId?: string
  language?: AiLanguage
}

export interface ToolCall {
  tool: string
  input: Record<string, unknown>
  /** Set by the caller after an explicit user confirmation when required. */
  confirmed?: boolean
}

export type ToolErrorCode =
  | 'unknown_tool'
  | 'disabled_tool'
  | 'missing_tenant'
  | 'invalid_input'
  | 'confirmation_required'
  | 'handler_failed'

export interface ToolResult {
  tool: string
  ok: boolean
  data?: unknown
  error?: string
  code?: ToolErrorCode
  durationMs: number
}

export type ToolHandler<K extends AiToolKey> = (
  input: ToolInputMap[K],
  ctx: ToolContext
) => Promise<unknown>

export type ToolHandlers = { [K in AiToolKey]: ToolHandler<K> }

export interface ToolExecutionOptions {
  enabledTools: ReadonlySet<AiToolKey>
  /** Tools whose config has requires_confirmation = true. */
  confirmationRequired?: ReadonlySet<AiToolKey>
}

function isToolKey(value: string): value is AiToolKey {
  return (TOOL_ALLOWLIST as readonly string[]).includes(value)
}

/** Filters untrusted configured keys down to the DB-backed allowlist. */
export function filterAllowedTools(keys: readonly string[]): AiToolKey[] {
  return [...new Set(keys.filter(isToolKey))]
}

function fail(call: ToolCall, code: ToolErrorCode, message: string, startedAt: number): ToolResult {
  return { tool: call.tool, ok: false, code, error: message, durationMs: Date.now() - startedAt }
}

/**
 * Executes one validated tool call. No raw SQL or code is accepted: inputs are
 * parsed against strict zod schemas, the tool must be on the DB-backed
 * allowlist and enabled for the agent, and a tenant context is mandatory.
 *
 * Handlers are injected so this module never imports a Supabase client and can
 * be unit tested. Real handlers call trusted RPCs with ctx.tenantId; a booking
 * confirmation must only be reported by the caller after the RPC succeeds.
 */
export async function executeToolCall(
  call: ToolCall,
  ctx: ToolContext,
  handlers: ToolHandlers,
  options: ToolExecutionOptions
): Promise<ToolResult> {
  const startedAt = Date.now()

  if (!ctx.tenantId || !ctx.agentId) {
    return fail(call, 'missing_tenant', 'A tenant and agent context is required', startedAt)
  }
  if (!isToolKey(call.tool)) {
    return fail(call, 'unknown_tool', `Unknown AI tool: ${call.tool}`, startedAt)
  }
  if (!options.enabledTools.has(call.tool)) {
    return fail(call, 'disabled_tool', `Tool is not enabled for this agent: ${call.tool}`, startedAt)
  }
  if (
    options.confirmationRequired?.has(call.tool) &&
    call.confirmed !== true
  ) {
    return fail(call, 'confirmation_required', 'This action requires explicit confirmation', startedAt)
  }

  if (!call.input || typeof call.input !== 'object' || Array.isArray(call.input)) {
    return fail(call, 'invalid_input', 'Tool input must be an object', startedAt)
  }

  const parsed = TOOL_SCHEMAS[call.tool].safeParse(call.input)
  if (!parsed.success) {
    return fail(call, 'invalid_input', `Invalid tool input: ${parsed.error.issues[0]?.message ?? 'validation failed'}`, startedAt)
  }

  try {
    const data = await handlers[call.tool](parsed.data as never, ctx)
    return { tool: call.tool, ok: true, data, durationMs: Date.now() - startedAt }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tool execution failed'
    return fail(call, 'handler_failed', message, startedAt)
  }
}

/** Runs calls in order, stopping after the first failure. */
export async function executeToolCalls(
  calls: readonly ToolCall[],
  ctx: ToolContext,
  handlers: ToolHandlers,
  options: ToolExecutionOptions
): Promise<ToolResult[]> {
  const results: ToolResult[] = []
  for (const call of calls) {
    const result = await executeToolCall(call, ctx, handlers, options)
    results.push(result)
    if (!result.ok) break
  }
  return results
}
