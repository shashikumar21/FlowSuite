// Server-only WhatsApp Cloud API sender. Uses the official Meta Graph API;
// no unofficial WhatsApp client library is used anywhere in this repository.

import { normalizeIdempotencyKey } from '../http.ts';
import { normalizeWhatsAppSender } from './whatsapp.ts';

export interface WhatsAppMessagingState {
  /** True when the contact messaged us within Meta's 24-hour service window. */
  sessionOpen: boolean;
  /** An explicit opt-out always blocks outbound messages, even in-session. */
  optedOut: boolean;
  /** Explicit opt-in recorded in public.communication_consents. */
  consented: boolean;
}

export interface WhatsAppSendInput {
  tenantId: string;
  contactId: string;
  to: string;
  content: string;
  accessToken: string;
  phoneNumberId: string;
  state: WhatsAppMessagingState;
  idempotencyKey: string;
  templateName?: string | null;
  templateLanguage?: string | null;
  fetchImpl?: typeof fetch;
}

export interface WhatsAppSendResult {
  provider: 'meta_cloud_api';
  providerMessageId: string | null;
  mode: 'text' | 'template';
}

export type WhatsAppSendErrorCode =
  | 'opted_out'
  | 'consent_required'
  | 'template_required'
  | 'invalid_recipient'
  | 'invalid_message'
  | 'invalid_idempotency_key'
  | 'not_configured'
  | 'provider_error';

export class WhatsAppSendError extends Error {
  readonly code: WhatsAppSendErrorCode;

  constructor(code: WhatsAppSendErrorCode, message: string) {
    super(message);
    this.name = 'WhatsAppSendError';
    this.code = code;
  }
}

interface GraphResponse {
  messages?: Array<{ id?: string }>;
  error?: { message?: string };
}

/**
 * Sends one message after consent/opt-out and Meta window checks. Outside a
 * service session an approved template name is mandatory; opt-out is absolute.
 */
export async function sendWhatsAppMessage(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
  if (input.state.optedOut) {
    throw new WhatsAppSendError('opted_out', 'This contact has opted out of WhatsApp messages');
  }

  const to = normalizeWhatsAppSender(input.to);
  if (!to) {
    throw new WhatsAppSendError('invalid_recipient', 'Invalid WhatsApp recipient');
  }
  const content = input.content.trim();
  if (!content || content.length > 4000) {
    throw new WhatsAppSendError('invalid_message', 'Message must be between 1 and 4000 characters');
  }
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (!idempotencyKey) {
    throw new WhatsAppSendError('invalid_idempotency_key', 'Invalid idempotency key');
  }
  if (!input.accessToken.trim() || !input.phoneNumberId.trim()) {
    throw new WhatsAppSendError('not_configured', 'WhatsApp Cloud API is not configured');
  }

  const templateName = input.templateName?.trim() ?? null;
  if (templateName && !input.state.consented) {
    throw new WhatsAppSendError('consent_required', 'Explicit opt-in is required for template messages');
  }
  if (!input.state.sessionOpen && !templateName) {
    throw new WhatsAppSendError('template_required', 'An approved template is required outside the service window');
  }

  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
  };
  if (templateName) {
    payload.type = 'template';
    payload.template = {
      name: templateName,
      language: { code: input.templateLanguage?.trim() || 'en' },
    };
  } else {
    payload.type = 'text';
    payload.text = { body: content };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(input.phoneNumberId)}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    },
  );

  const body = await response.json().catch(() => null) as GraphResponse | null;
  if (!response.ok || body?.error) {
    throw new WhatsAppSendError('provider_error', 'WhatsApp provider rejected the message');
  }

  return {
    provider: 'meta_cloud_api',
    providerMessageId: body?.messages?.[0]?.id?.trim() || null,
    mode: templateName ? 'template' : 'text',
  };
}
