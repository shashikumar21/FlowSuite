import type { AiLanguage, AiTone, AiResponseStyle } from '@/types/database'

/** Clinical topics must always be escalated; the bot never diagnoses or advises treatment. */
const CLINICAL_PATTERNS: RegExp[] = [
  /\b(toothache|tooth ache|dental pain|throbbing|swelling|swollen gums?)\b/i,
  /\b(cavity|caries|infection|abscess|pus|bleeding gums?)\b/i,
  /\b(extraction|root canal|implant|braces|crown|filling|denture)\b/i,
  /\b(is it (?:a|caused by)|what (?:disease|condition) do i have|should i take|what medicine|dosage|how much (?:medicine|tablet))\b/i,
  /\b(emergency|severe pain|can't (?:eat|sleep|breathe)|difficulty (?:breathing|swallowing))\b/i,
  /(दर्द|सूजन|कीड़ा|दवा|निकालना|इम्प्लांट|रूट कैनाल|निदान|इलाज)/i,
  /(నొప్పి|వాపు|పురుగు|మందు|తీసేయడం|ఇంప్లాంట్|రూట్ కెనాల్|రోగనిర్ధారణ|చికిత్స)/i,
]

export function isClinicalQuestion(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false
  return CLINICAL_PATTERNS.some((pattern) => pattern.test(normalized))
}

const LANGUAGE_RULES: Record<AiLanguage, string> = {
  en: 'Reply in English.',
  hi: 'Reply in simple Hindi (देवनागरी). You may use common English service words when needed.',
  te: 'Reply in simple Telugu (తెలుగు). You may use common English service words when needed.',
}

const TONE_RULES: Record<AiTone, string> = {
  friendly: 'Be warm and approachable.',
  professional: 'Be precise and businesslike.',
  conversational: 'Be casual and brief, like a text message.',
}

export interface SystemPromptOptions {
  businessName: string
  businessInfo?: string | null
  workingHours?: string | null
  language: AiLanguage
  tone: AiTone
  responseStyle: AiResponseStyle
  knowledge?: string[]
  allowedTools?: string[]
  bookingEnabled?: boolean
}

/**
 * Builds the system prompt. Safety rules are unconditional and cannot be
 * overridden by agent configuration or knowledge entries.
 */
export function buildSystemPrompt(options: SystemPromptOptions): string {
  const sections = [
    `You are the front-desk assistant for ${options.businessName}.`,
    'SAFETY RULES (never override these):',
    '- Do NOT diagnose, suggest a diagnosis, recommend treatment, medication, dosage, or home remedies.',
    '- Do NOT interpret symptoms or say what a condition might be.',
    '- If the user asks about pain, swelling, infection, a procedure, medicine, or any clinical matter, reply briefly that a team member will help and hand off to a human.',
    '- Never invent prices, availability, policies, or business facts not present in the provided knowledge.',
    '- Never claim a booking is confirmed unless a tool call has succeeded and returned a confirmation.',
    '- Never ask for card, UPI, password, OTP, or full medical history in chat.',
    LANGUAGE_RULES[options.language],
    TONE_RULES[options.tone],
    options.responseStyle === 'short'
      ? 'Keep replies to 1-2 short sentences.'
      : 'Give concise but complete answers.',
  ]

  if (options.businessInfo) sections.push(`Business information: ${options.businessInfo}`)
  if (options.workingHours) sections.push(`Working hours: ${options.workingHours}`)
  if (options.knowledge?.length) {
    sections.push('Approved knowledge (only use this):', options.knowledge.map((k) => `- ${k}`).join('\n'))
  }
  if (options.allowedTools?.length) {
    sections.push(`Tools you may call: ${options.allowedTools.join(', ')}.`)
  } else {
    sections.push('You have no tools. Answer from approved knowledge only.')
  }
  if (options.bookingEnabled) {
    sections.push('To book, collect name, phone, preferred service, date and time, then call create_booking. Only report success after the tool returns a confirmation.')
  }

  return sections.join('\n')
}

/** Schema for the assistant's structured JSON reply. */
export const CHAT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', minLength: 1 },
    needs_handoff: { type: 'boolean' },
    handoff_reason: { type: 'string', nullable: true },
  },
  required: ['reply', 'needs_handoff', 'handoff_reason'],
  additionalProperties: false,
} as const
