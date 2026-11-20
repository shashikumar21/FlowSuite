import type {
  AiAgentStatus,
  AiClassification,
  AiConsentStatus,
  AiFollowUpJobStatus,
  ChannelCredentialRow,
  ConversationRow,
} from '@/types/database'
import { classificationLabels } from './schemas'

type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

export function chatEndpointUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '')
  return base ? `${base}/functions/v1/ai-chat` : ''
}

/** HTML a business can paste into its own site. The public key is not a secret. */
export function buildEmbedSnippet(publicKey: string): string {
  const endpoint = chatEndpointUrl()
  if (!publicKey || !endpoint) return ''
  return `<!-- FlowSuite AI website chat -->
<script>
  window.FLOW_SUITE_CHAT = {
    endpoint: ${JSON.stringify(endpoint)},
    publicKey: ${JSON.stringify(publicKey)}
  };
</script>
<script src="${endpoint.replace(/\/ai-chat$/, '/ai-chat-widget.js')}" async></script>`
}

export function agentStatusVariant(status: AiAgentStatus): BadgeVariant {
  if (status === 'active') return 'success'
  if (status === 'paused') return 'warning'
  return 'neutral'
}

export function conversationAiStatusVariant(status: ConversationRow['ai_status']): BadgeVariant {
  if (status === 'active') return 'success'
  if (status === 'handed_off') return 'brand'
  if (status === 'paused') return 'warning'
  return 'neutral'
}

export function credentialStatusVariant(status: ChannelCredentialRow['status']): BadgeVariant {
  if (status === 'active') return 'success'
  if (status === 'error') return 'danger'
  return 'neutral'
}

export function jobStatusVariant(status: AiFollowUpJobStatus): BadgeVariant {
  if (status === 'sent') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'pending') return 'warning'
  if (status === 'processing') return 'brand'
  return 'neutral'
}

export function consentStatusVariant(status: AiConsentStatus | null): BadgeVariant {
  if (status === 'opt_in') return 'success'
  if (status === 'opt_out') return 'danger'
  return 'neutral'
}

export function classificationLabel(value: AiClassification | string): string {
  return classificationLabels[value] ?? value
}

export function formatCost(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  }).format(value)
}

export type UsageSummary = {
  totalTokens: number
  estimatedCost: number
  calls: number
  failures: number
  lastCallAt: string | null
}

export function summarizeUsage(logs: Array<{ total_tokens: number; estimated_cost: number; success: boolean; created_at: string }>): UsageSummary {
  return logs.reduce<UsageSummary>(
    (total, log) => ({
      totalTokens: total.totalTokens + log.total_tokens,
      estimatedCost: total.estimatedCost + log.estimated_cost,
      calls: total.calls + 1,
      failures: total.failures + (log.success ? 0 : 1),
      lastCallAt: total.lastCallAt && total.lastCallAt > log.created_at ? total.lastCallAt : log.created_at,
    }),
    { totalTokens: 0, estimatedCost: 0, calls: 0, failures: 0, lastCallAt: null },
  )
}

export function statusMessage(code: string): string {
  const messages: Record<string, string> = {
    not_configured: 'The AI provider is not configured on the server. No key is stored in the browser.',
    service_unavailable: 'The chatbot function is not available yet. It must be deployed with server secrets first.',
    origin_not_allowed: 'This website origin is not in the chatbot CORS allowlist.',
    agent_not_found: 'No active agent matched this public key.',
    limit_reached: 'This agent has reached its monthly token limit.',
    clinical_escalation: 'A clinical question was detected and handed to your team. No AI answer was generated.',
    invalid_request: 'The request was rejected before reaching the AI provider.',
    internal_error: 'The chatbot request failed. No reply was stored.',
  }
  return messages[code] ?? `Chatbot request failed (${code}).`
}
