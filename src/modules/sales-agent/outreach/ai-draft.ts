import { AiProviderError } from '@/modules/ai/providers/errors'
import type { AiProvider, AiTextMessage } from '@/modules/ai/providers/types'
import type { Json } from '@/types/database'
import { generatedDraftSchema, type EmailDraftInput, type GeneratedDraft } from './schemas'
import { emailDraftInputSchema } from './schemas'

/**
 * Vendor-neutral draft generation. This module is pure: it receives an already
 * constructed AiProvider, reads no environment variables, and never writes to
 * the database. The Edge Function owns the secret and the Supabase client.
 */

export const DRAFT_RESPONSE_FORMAT = {
  name: 'sales_email_draft',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'subject', 'opening', 'body', 'cta',
      'follow_up_subject', 'follow_up_body',
    ],
    properties: {
      subject: { type: 'string', minLength: 1, maxLength: 200 },
      opening: { type: 'string', minLength: 1, maxLength: 1000 },
      body: { type: 'string', minLength: 1, maxLength: 8000 },
      cta: { type: 'string', minLength: 1, maxLength: 500 },
      follow_up_subject: { type: 'string', minLength: 1, maxLength: 200 },
      follow_up_body: { type: 'string', minLength: 1, maxLength: 4000 },
    },
  },
} as const

/**
 * Prompt text is deliberately conservative: the model is told to use only the
 * supplied facts, to avoid invented claims, and that the result is an unsent
 * draft. It must never imply a delivery or a metric.
 */
export function buildDraftMessages(input: EmailDraftInput): AiTextMessage[] {
  const safe = emailDraftInputSchema.parse(input)
  const context = [
    `Prospect business: ${safe.business_website || 'not supplied'}`,
    `Industry: ${safe.industry || 'not supplied'}`,
    `Product or service offered: ${safe.product_offered}`,
    `Problem addressed: ${safe.problem_addressed}`,
    `Campaign objective: ${safe.campaign_objective}`,
    `Tone: ${safe.tone}`,
  ].join('\n')

  return [
    {
      role: 'system',
      content: [
        'You write short, honest B2B outreach email drafts for a sales agent.',
        'Use only facts present in the supplied context. Never invent customer names,',
        'results, statistics, integrations, certifications or claims about the recipient.',
        'If a detail is missing, write a neutral sentence instead of guessing.',
        'Return an UNSENT DRAFT only. Do not claim any email was sent, scheduled or delivered.',
        'Respond with JSON matching the requested schema and no other text.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        'Write an initial outreach email plus one follow-up for this prospect.',
        context,
        'The opening must be personalised but must not pretend to know facts that were not supplied.',
        'The body must explain the problem and the offered product or service in plain language.',
        'The cta is a single low-pressure call to action.',
        'The follow-up is a brief, separate reminder, not a resend notification.',
      ].join('\n'),
    },
  ]
}

/** Parse the model response, then validate it strictly. Fails closed on drift. */
export function parseGeneratedDraft(completion: { parsed: unknown; content: string }): GeneratedDraft {
  let candidate: unknown = completion.parsed
  if (candidate == null && completion.content.trim()) {
    try {
      candidate = JSON.parse(completion.content)
    } catch {
      throw new AiProviderError('The draft service returned invalid JSON.', { code: 'invalid_response' })
    }
  }

  const result = generatedDraftSchema.safeParse(candidate)
  if (!result.success) {
    throw new AiProviderError('The draft service returned an unexpected shape.', { code: 'schema_mismatch' })
  }
  return result.data
}

export async function generateEmailDraft(
  input: EmailDraftInput,
  provider: AiProvider,
): Promise<GeneratedDraft> {
  // Re-validate at the boundary; callers may pass hand-built objects.
  const safe = emailDraftInputSchema.parse(input)
  const completion = await provider.complete({
    messages: buildDraftMessages(safe),
    responseFormat: DRAFT_RESPONSE_FORMAT as { name: string; schema: Record<string, unknown>; strict?: boolean },
    temperature: 0.4,
    maxTokens: 1200,
  })
  return parseGeneratedDraft(completion)
}

/** Convert a validated draft into the JSON body expected by the Edge Function. */
export function generatedDraftToJson(draft: GeneratedDraft): Json {
  return draft as unknown as Json
}
