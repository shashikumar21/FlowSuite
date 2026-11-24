// Patient email rendering and dispatch loop. Server-only: deployed with the
// `patient-email-dispatch` Edge Function and unit-tested from src/**/*.test.ts.
// It has no Deno or Supabase imports so the logic can be tested in isolation.

// Structural copies of the email.ts types (kept local so this file stays free
// of class syntax the browser tsconfig rejects; email.ts providers satisfy them).
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tenantId?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ provider: string; providerMessageId: string | null }>;
}

export type PatientEmailKind =
  | 'booking_confirmation'
  | 'booking_rescheduled'
  | 'booking_cancelled'
  | 'appointment_reminder'
  | 'review_request';

/** One claimed outbox row, as returned by `patient_email_claim_due`. */
export interface PatientEmailJob {
  id: string;
  tenant_id: string;
  kind: PatientEmailKind;
  to_email: string;
  customer_name: string | null;
  business_name: string;
  business_phone: string | null;
  business_email: string | null;
  timezone: string;
  reply_to: string | null;
  service_name: string | null;
  start_at: string | null;
  end_at: string | null;
  booking_slug: string | null;
  review_link_type: string | null;
  review_url: string | null;
  review_token: string | null;
  review_message: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const KINDS: ReadonlySet<string> = new Set([
  'booking_confirmation',
  'booking_rescheduled',
  'booking_cancelled',
  'appointment_reminder',
  'review_request',
]);

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Formats an instant in the business timezone, e.g. "Tue, 25 Nov 2026 at 10:30 am". */
export function formatAppointmentTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const zone = isValidTimeZone(timeZone) ? timeZone : 'Asia/Kolkata';
  const day = new Intl.DateTimeFormat('en-IN', {
    timeZone: zone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
  const time = new Intl.DateTimeFormat('en-IN', {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
  return `${day} at ${time.toLowerCase()}`;
}

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-IN', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function firstName(name: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0] ?? 'there';
}

function safeHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Review link: FlowSuite feedback page when tokenised, else the saved Google/custom URL. */
export function reviewLink(job: PatientEmailJob, appOrigin: string): string | null {
  if (job.review_link_type === 'flowsuite' && job.review_token && /^[A-Za-z0-9]{16,128}$/.test(job.review_token)) {
    return `${appOrigin.replace(/\/$/, '')}/r/${job.review_token}`;
  }
  return safeHttpUrl(job.review_url);
}

function bookingLink(job: PatientEmailJob, appOrigin: string): string | null {
  if (!job.booking_slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(job.booking_slug)) return null;
  return `${appOrigin.replace(/\/$/, '')}/book/${job.booking_slug}`;
}

function contactLine(job: PatientEmailJob): string {
  const parts = [job.business_phone?.trim(), job.business_email?.trim()].filter(Boolean);
  return parts.length ? `call or message us on ${parts.join(' / ')}` : 'reply to this email';
}

interface Section {
  heading: string;
  paragraphs: string[];
  details?: Array<[string, string]>;
  button?: { label: string; url: string };
}

function layout(job: PatientEmailJob, section: Section): { html: string; text: string } {
  const business = escapeHtml(job.business_name);
  const paragraphs = section.paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p)}</p>`).join('');
  const details = section.details?.length
    ? `<table role="presentation" style="border-collapse:collapse;margin:6px 0 18px;width:100%">${section.details
        .map(([label, value]) =>
          `<tr><td style="padding:6px 12px 6px 0;color:#64748b;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(value)}</td></tr>`)
        .join('')}</table>`
    : '';
  const button = section.button
    ? `<p style="margin:8px 0 18px"><a href="${escapeHtml(section.button.url)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600">${escapeHtml(section.button.label)}</a></p>`
    : '';

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#ffffff;border-radius:12px;padding:24px">
<p style="margin:0 0 4px;color:#0f766e;font-weight:700;font-size:14px">${business}</p>
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(section.heading)}</h1>
${paragraphs}${details}${button}
</div>
<p style="margin:14px 4px 0;color:#94a3b8;font-size:12px;line-height:1.5">Sent by ${business} because you booked or visited with them.</p>
</div></body></html>`;

  const textLines = [
    job.business_name,
    '',
    section.heading,
    '',
    ...section.paragraphs.flatMap((p) => [p, '']),
    ...(section.details ?? []).map(([label, value]) => `${label}: ${value}`),
    ...(section.details?.length ? [''] : []),
    ...(section.button ? [`${section.button.label}: ${section.button.url}`, ''] : []),
  ];
  return { html, text: textLines.join('\n').trim() + '\n' };
}

/** Builds the subject/body for a job, or returns null when it cannot be rendered safely. */
export function renderPatientEmail(job: PatientEmailJob, appOrigin: string): RenderedEmail | null {
  const hello = `Hi ${firstName(job.customer_name)},`;
  const business = job.business_name.trim() || 'your clinic';

  if (job.kind === 'review_request') {
    const link = reviewLink(job, appOrigin);
    if (!link) return null;
    const custom = job.review_message?.trim();
    const { html, text } = layout(job, {
      heading: 'How was your visit?',
      paragraphs: [
        hello,
        custom && custom.length <= 600
          ? custom.replace(/\{\{\s*(name|customer_name)\s*\}\}/gi, firstName(job.customer_name)).replace(/\{\{\s*(link|review_link)\s*\}\}/gi, '').trim()
          : `Thank you for visiting ${business}. It would mean a lot if you could take a minute to share how it went.`,
      ],
      button: { label: 'Share your feedback', url: link },
    });
    return { subject: `How was your visit to ${business}?`, html, text };
  }

  if (!job.start_at) return null;
  const when = formatAppointmentTime(job.start_at, job.timezone);
  const details: Array<[string, string]> = [['When', when]];
  if (job.service_name?.trim()) details.push(['For', job.service_name.trim()]);
  const change = `Need to change it? Please ${contactLine(job)}.`;
  const rebook = bookingLink(job, appOrigin);

  switch (job.kind) {
    case 'booking_confirmation': {
      const { html, text } = layout(job, {
        heading: 'Your appointment is booked',
        paragraphs: [hello, `Thanks for booking with ${business}. Here are your details.`, change],
        details,
      });
      return { subject: `Booked: ${when} at ${business}`, html, text };
    }
    case 'booking_rescheduled': {
      const { html, text } = layout(job, {
        heading: 'Your appointment has moved',
        paragraphs: [hello, `Your appointment with ${business} now has a new time.`, change],
        details,
      });
      return { subject: `New time: ${when} at ${business}`, html, text };
    }
    case 'appointment_reminder': {
      const { html, text } = layout(job, {
        heading: 'Reminder: your appointment is coming up',
        paragraphs: [hello, `This is a friendly reminder of your appointment with ${business}.`, change],
        details,
      });
      return { subject: `Reminder: ${when} at ${business}`, html, text };
    }
    case 'booking_cancelled': {
      const { html, text } = layout(job, {
        heading: 'Your appointment was cancelled',
        paragraphs: [
          hello,
          `Your appointment with ${business} on ${when} has been cancelled.`,
          rebook ? 'You can pick a new time whenever it suits you.' : `To book again, please ${contactLine(job)}.`,
        ],
        button: rebook ? { label: 'Book a new time', url: rebook } : undefined,
      });
      return { subject: `Cancelled: ${when} at ${business}`, html, text };
    }
    default:
      return null;
  }
}

/** Validates the untrusted jsonb array returned by the claim RPC. */
export function parseClaimedJobs(value: unknown): PatientEmailJob[] {
  if (!Array.isArray(value)) return [];
  const jobs: PatientEmailJob[] = [];
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const raw = item as Record<string, unknown>;
    const id = str(raw.id);
    const tenantId = str(raw.tenant_id);
    const kind = str(raw.kind);
    const to = str(raw.to_email);
    if (!id || !tenantId || !kind || !KINDS.has(kind) || !to) continue;
    jobs.push({
      id,
      tenant_id: tenantId,
      kind: kind as PatientEmailKind,
      to_email: to,
      customer_name: str(raw.customer_name),
      business_name: str(raw.business_name) ?? 'Your clinic',
      business_phone: str(raw.business_phone),
      business_email: str(raw.business_email),
      timezone: str(raw.timezone) ?? 'Asia/Kolkata',
      reply_to: str(raw.reply_to),
      service_name: str(raw.service_name),
      start_at: str(raw.start_at),
      end_at: str(raw.end_at),
      booking_slug: str(raw.booking_slug),
      review_link_type: str(raw.review_link_type),
      review_url: str(raw.review_url),
      review_token: str(raw.review_token),
      review_message: str(raw.review_message),
    });
  }
  return jobs;
}

export interface PatientEmailStore {
  claimDue(limit: number): Promise<unknown>;
  markResult(input: {
    id: string;
    ok: boolean;
    provider: string;
    providerMessageId?: string | null;
    error?: string | null;
  }): Promise<void>;
}

export interface DispatchSummary {
  claimed: number;
  sent: number;
  failed: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Claims due rows, renders and sends each one, and records the outcome.
 * A failure on one email never stops the rest of the batch.
 */
export async function dispatchPatientEmails(options: {
  store: PatientEmailStore;
  provider: EmailProvider;
  appOrigin: string;
  limit?: number;
}): Promise<DispatchSummary> {
  const { store, provider, appOrigin } = options;
  const jobs = parseClaimedJobs(await store.claimDue(options.limit ?? 25));
  const summary: DispatchSummary = { claimed: jobs.length, sent: 0, failed: 0 };

  for (const job of jobs) {
    const rendered = renderPatientEmail(job, appOrigin);
    if (!rendered) {
      summary.failed += 1;
      await store.markResult({ id: job.id, ok: false, provider: provider.name, error: 'render_failed' });
      continue;
    }
    const replyTo = job.reply_to && EMAIL_RE.test(job.reply_to) ? job.reply_to : undefined;
    const message: EmailMessage = {
      to: job.to_email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      replyTo,
      tenantId: job.tenant_id,
    };
    try {
      const result = await provider.send(message);
      summary.sent += 1;
      await store.markResult({ id: job.id, ok: true, provider: result.provider, providerMessageId: result.providerMessageId });
    } catch (error) {
      summary.failed += 1;
      const detail = error instanceof Error ? error.message : 'send_failed';
      await store.markResult({ id: job.id, ok: false, provider: provider.name, error: detail.slice(0, 300) });
    }
  }
  return summary;
}
