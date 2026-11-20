// Server-only lead qualification. Uses strict structured output and the
// validated tool schema; it never invents scores or writes raw model JSON.

import { AiProviderError } from '../../../../src/modules/ai/providers/errors.ts';
import type { AiProvider } from '../../../../src/modules/ai/providers/types.ts';
import { qualifyLeadSchema } from '../../../../src/modules/ai/tools/schemas.ts';
import { buildUsageRecord, requireUsageAllowance, type UsageRecord } from '../../../../src/modules/ai/usage.ts';
import type { AgentContext } from './chat.ts';

export const QUALIFY_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    classification: {
      type: 'string',
      enum: ['information_request', 'high_intent', 'future_follow_up', 'not_interested', 'unknown'],
    },
    summary: { type: 'string', minLength: 1, maxLength: 2000 },
    intent: { type: 'string', nullable: true, maxLength: 200 },
    serviceInterest: { type: 'string', nullable: true, maxLength: 200 },
  },
  required: ['classification', 'summary', 'intent', 'serviceInterest'],
  additionalProperties: false,
} as const;

export type Classification = 'information_request' | 'high_intent' | 'future_follow_up' | 'not_interested' | 'unknown';
export type FollowUpChannel = 'whatsapp' | 'sms' | 'email';

export interface QualificationStore {
  checkUsageLimit(tenantId: string, agentId: string): Promise<boolean>;
  recordUsage(record: UsageRecord): Promise<void>;
  recordAssessment(input: {
    tenantId: string;
    contactId: string;
    conversationId: string | null;
    classification: Classification;
    summary: string;
    intent: string | null;
    serviceInterest: string | null;
    provider: string;
    model: string | null;
  }): Promise<string>;
  getActiveFollowUpSequence(tenantId: string): Promise<string | null>;
  enqueueFollowUp(input: {
    tenantId: string;
    contactId: string;
    sequenceId: string;
    channel: FollowUpChannel;
    conversationId: string | null;
  }): Promise<string | null>;
}

export interface QualifyLeadInput {
  agent: AgentContext;
  contactId: string;
  conversationId: string | null;
  customerMessage: string;
  assistantReply?: string | null;
  provider: AiProvider;
  store: QualificationStore;
  followUpChannel?: FollowUpChannel | null;
  requestId?: string;
}

export interface QualificationResult {
  classification: Classification;
  summary: string;
  assessmentId: string;
  followUpJobId: string | null;
  provider: string;
  model: string;
}

function errorCode(error: unknown): string {
  return error instanceof AiProviderError ? error.code : 'handler_failed';
}

/**
 * Records one validated assessment. A follow-up is queued only for
 * future_follow_up, with an active tenant sequence and an existing opt-in
 * (the RPC re-checks consent before writing the job).
 */
export async function qualifyLead(input: QualifyLeadInput): Promise<QualificationResult> {
  const { agent, provider, store } = input;
  const customerMessage = input.customerMessage.trim().slice(0, 4000);
  if (!customerMessage) {
    throw new AiProviderError('Cannot qualify an empty message', { code: 'invalid_request' });
  }

  let completion: Awaited<ReturnType<AiProvider['complete']>>;
  try {
    await requireUsageAllowance(agent.tenant_id, agent.agent_id, store.checkUsageLimit);
    completion = await provider.complete({
      messages: [
        {
          role: 'system',
          content: [
            'Classify this front-desk conversation for CRM follow-up.',
            'Never invent facts, lead scores, medical opinions or commitments.',
            'classification must be one of: information_request, high_intent, future_follow_up, not_interested, unknown.',
            'summary must be a short factual description of the customer message.',
            'Use null for intent or serviceInterest when the customer did not state one.',
          ].join('\n'),
        },
        { role: 'user', content: `Customer: ${customerMessage}` },
        ...(input.assistantReply
          ? [{ role: 'assistant' as const, content: `Assistant: ${input.assistantReply.slice(0, 4000)}` }]
          : []),
      ],
      language: agent.language,
      responseFormat: { name: 'lead_classification', schema: QUALIFY_RESPONSE_SCHEMA, strict: true },
      requestId: input.requestId,
    });
  } catch (error) {
    await store.recordUsage(buildUsageRecord({
      tenantId: agent.tenant_id,
      agentId: agent.agent_id,
      conversationId: input.conversationId,
      channel: 'internal',
      operation: 'qualify',
      provider: provider.id,
      errorCode: errorCode(error),
      requestId: input.requestId,
    }));
    throw error;
  }

  const parsed = qualifyLeadSchema.safeParse(completion.parsed);
  if (!parsed.success) {
    await store.recordUsage(buildUsageRecord({
      tenantId: agent.tenant_id,
      agentId: agent.agent_id,
      conversationId: input.conversationId,
      channel: 'internal',
      operation: 'qualify',
      provider: provider.id,
      errorCode: 'schema_mismatch',
      requestId: input.requestId,
    }));
    throw new AiProviderError('Lead qualification output failed validation', { code: 'schema_mismatch' });
  }

  await store.recordUsage(buildUsageRecord({
    tenantId: agent.tenant_id,
    agentId: agent.agent_id,
    conversationId: input.conversationId,
    channel: 'internal',
    operation: 'qualify',
    provider: provider.id,
    completion,
    requestId: input.requestId,
  }));

  const value = parsed.data;
  const assessmentId = await store.recordAssessment({
    tenantId: agent.tenant_id,
    contactId: input.contactId,
    conversationId: input.conversationId,
    classification: value.classification,
    summary: value.summary,
    intent: value.intent ?? null,
    serviceInterest: value.serviceInterest ?? null,
    provider: provider.id,
    model: completion.model,
  });

  let followUpJobId: string | null = null;
  if (value.classification === 'future_follow_up' && input.followUpChannel) {
    const sequenceId = await store.getActiveFollowUpSequence(agent.tenant_id);
    if (sequenceId) {
      followUpJobId = await store.enqueueFollowUp({
        tenantId: agent.tenant_id,
        contactId: input.contactId,
        sequenceId,
        channel: input.followUpChannel,
        conversationId: input.conversationId,
      });
    }
  }

  return {
    classification: value.classification,
    summary: value.summary,
    assessmentId,
    followUpJobId,
    provider: provider.id,
    model: completion.model,
  };
}
