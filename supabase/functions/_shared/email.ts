// Server-only email adapter. This file is deployed with Supabase Edge
// Functions and must never be imported by browser code (`src/**`).
// Provider credentials come exclusively from Supabase secrets / Deno.env.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tenantId?: string;
}

export interface EmailSendResult {
  provider: string;
  providerMessageId: string | null;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/** Safe default: no credentials means no external calls, ever. */
class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';

  async send(message: EmailMessage): Promise<EmailSendResult> {
    console.info('[email:console] suppressed delivery', {
      to: message.to,
      subject: message.subject,
      tenantId: message.tenantId ?? null,
    });
    return { provider: this.name, providerMessageId: null };
  }
}

/**
 * Minimal Resend adapter. This is the intended production seam: swap the
 * endpoint/payload here rather than changing callers. No API key is stored in
 * this repository.
 */
class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text ?? undefined,
        reply_to: message.replyTo ?? undefined,
        // Tag every message so provider usage can be reconciled per tenant.
        tags: message.tenantId
          ? [{ name: 'tenant_id', value: message.tenantId }]
          : undefined,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Email provider returned ${response.status}: ${detail.slice(0, 500)}`);
    }

    const body = await response.json() as { id?: string };
    return { provider: this.name, providerMessageId: body.id ?? null };
  }
}

export interface EmailEnv {
  EMAIL_PROVIDER?: string;
  EMAIL_PROVIDER_API_KEY?: string;
  EMAIL_FROM_ADDRESS?: string;
}

/**
 * Falls back to the console adapter whenever credentials are absent, so a
 * partially configured deployment cannot accidentally send mail.
 */
export function createEmailProvider(env: EmailEnv): EmailProvider {
  const provider = (env.EMAIL_PROVIDER ?? 'auto').toLowerCase();
  const apiKey = env.EMAIL_PROVIDER_API_KEY;
  const from = env.EMAIL_FROM_ADDRESS;

  if (provider === 'console') return new ConsoleEmailProvider();
  if (provider === 'resend') {
    if (!apiKey || !from) {
      throw new Error('EMAIL_PROVIDER=resend requires EMAIL_PROVIDER_API_KEY and EMAIL_FROM_ADDRESS');
    }
    return new ResendEmailProvider(apiKey, from);
  }
  if (apiKey && from) return new ResendEmailProvider(apiKey, from);
  return new ConsoleEmailProvider();
}
