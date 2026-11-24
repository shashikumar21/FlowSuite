import { describe, expect, it, vi } from 'vitest'
import {
  dispatchPatientEmails,
  escapeHtml,
  formatAppointmentTime,
  parseClaimedJobs,
  renderPatientEmail,
  reviewLink,
  type EmailMessage,
  type EmailProvider,
  type PatientEmailJob,
  type PatientEmailStore,
} from '../../../supabase/functions/_shared/patient_email.ts'

const origin = 'https://app.example.com'

function job(overrides: Partial<PatientEmailJob> = {}): PatientEmailJob {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    tenant_id: '22222222-2222-4222-8222-222222222222',
    kind: 'booking_confirmation',
    to_email: 'patient@example.com',
    customer_name: 'Priya Sharma',
    business_name: 'Smile Dental',
    business_phone: '+91 98765 43210',
    business_email: 'hello@smile.example',
    timezone: 'Asia/Kolkata',
    reply_to: 'desk@smile.example',
    service_name: 'Teeth cleaning',
    // 05:00 UTC = 10:30 IST
    start_at: '2026-11-25T05:00:00.000Z',
    end_at: '2026-11-25T05:30:00.000Z',
    booking_slug: 'smile-dental',
    review_link_type: null,
    review_url: null,
    review_token: null,
    review_message: null,
    ...overrides,
  }
}

describe('formatAppointmentTime', () => {
  it('shows the time in the business timezone', () => {
    const text = formatAppointmentTime('2026-11-25T05:00:00.000Z', 'Asia/Kolkata')
    expect(text).toMatch(/^Wed, 25 Nov,? 2026 at /)
    expect(text).toContain('10:30')
    expect(text).toMatch(/am$/)
  })

  it('falls back to Asia/Kolkata for an invalid timezone', () => {
    expect(formatAppointmentTime('2026-11-25T05:00:00.000Z', 'Not/AZone')).toContain('10:30')
  })
})

describe('renderPatientEmail', () => {
  it('renders a confirmation with time, service and contact details', () => {
    const email = renderPatientEmail(job(), origin)!
    expect(email.subject).toContain('Booked:')
    expect(email.subject).toContain('Smile Dental')
    expect(email.text).toContain('Hi Priya,')
    expect(email.text).toContain('Teeth cleaning')
    expect(email.text).toContain('+91 98765 43210')
    expect(email.html).toContain('10:30')
  })

  it('escapes HTML in tenant and patient supplied values', () => {
    const email = renderPatientEmail(job({ business_name: '<script>x</script>', customer_name: '<b>Eve</b>' }), origin)!
    expect(email.html).not.toContain('<script>')
    expect(email.html).not.toContain('<b>Eve')
    expect(email.html).toContain('&lt;script&gt;')
  })

  it('renders reminder, reschedule and cancellation subjects', () => {
    expect(renderPatientEmail(job({ kind: 'appointment_reminder' }), origin)!.subject).toMatch(/^Reminder:/)
    expect(renderPatientEmail(job({ kind: 'booking_rescheduled' }), origin)!.subject).toMatch(/^New time:/)
    const cancelled = renderPatientEmail(job({ kind: 'booking_cancelled' }), origin)!
    expect(cancelled.subject).toMatch(/^Cancelled:/)
    expect(cancelled.text).toContain(`${origin}/book/smile-dental`)
  })

  it('refuses to render an appointment email without a start time', () => {
    expect(renderPatientEmail(job({ start_at: null }), origin)).toBeNull()
  })

  it('renders a review request with the FlowSuite feedback link', () => {
    const email = renderPatientEmail(job({ kind: 'review_request', review_link_type: 'flowsuite', review_token: 'a'.repeat(64) }), origin)!
    expect(email.subject).toBe('How was your visit to Smile Dental?')
    expect(email.text).toContain(`${origin}/r/${'a'.repeat(64)}`)
  })

  it('fills the {{name}} placeholder in a custom review message', () => {
    const email = renderPatientEmail(job({
      kind: 'review_request',
      review_link_type: 'google',
      review_url: 'https://g.page/r/abc/review',
      review_message: 'Thanks {{name}}! Please review us: {{link}}',
    }), origin)!
    expect(email.text).toContain('Thanks Priya! Please review us:')
    expect(email.text).toContain('https://g.page/r/abc/review')
    expect(email.text).not.toContain('{{')
  })

  it('refuses a review request without a safe link', () => {
    expect(renderPatientEmail(job({ kind: 'review_request', review_link_type: 'custom', review_url: 'javascript:alert(1)' }), origin)).toBeNull()
    expect(renderPatientEmail(job({ kind: 'review_request', review_link_type: 'flowsuite', review_token: '../bad' }), origin)).toBeNull()
  })
})

describe('reviewLink', () => {
  it('prefers the FlowSuite token link', () => {
    expect(reviewLink(job({ review_link_type: 'flowsuite', review_token: 'b'.repeat(32), review_url: 'https://x.example' }), origin + '/'))
      .toBe(`${origin}/r/${'b'.repeat(32)}`)
  })
})

describe('escapeHtml', () => {
  it('escapes quotes and angle brackets', () => {
    expect(escapeHtml(`"<a href='x'>&`)).toBe('&quot;&lt;a href=&#39;x&#39;&gt;&amp;')
  })
})

describe('parseClaimedJobs', () => {
  it('drops malformed rows and unknown kinds', () => {
    const jobs = parseClaimedJobs([
      { id: 'a', tenant_id: 't', kind: 'booking_confirmation', to_email: 'p@example.com', business_name: 'B' },
      { id: 'b', tenant_id: 't', kind: 'marketing_blast', to_email: 'p@example.com' },
      { id: 'c', kind: 'booking_confirmation' },
      null,
      'x',
    ])
    expect(jobs.map((j) => j.id)).toEqual(['a'])
    expect(jobs[0]!.timezone).toBe('Asia/Kolkata')
  })

  it('returns an empty list for a non-array', () => {
    expect(parseClaimedJobs(null)).toEqual([])
  })
})

describe('dispatchPatientEmails', () => {
  function makeStore(rows: unknown[]) {
    const results: Array<{ id: string; ok: boolean; error?: string | null }> = []
    const store: PatientEmailStore = {
      claimDue: vi.fn(async () => rows),
      markResult: vi.fn(async (input) => { results.push(input) }),
    }
    return { store, results }
  }

  it('sends each job and records success with the provider id', async () => {
    const { store, results } = makeStore([job(), job({ id: 'second', kind: 'appointment_reminder' })])
    const provider: EmailProvider = { name: 'resend', send: vi.fn(async () => ({ provider: 'resend', providerMessageId: 'msg-1' })) }
    const summary = await dispatchPatientEmails({ store, provider, appOrigin: origin })
    expect(summary).toEqual({ claimed: 2, sent: 2, failed: 0 })
    expect(results.every((r) => r.ok)).toBe(true)
    const sent = vi.mocked(provider.send).mock.calls[0]![0]
    expect(sent.to).toBe('patient@example.com')
    expect(sent.replyTo).toBe('desk@smile.example')
    expect(sent.tenantId).toBe(job().tenant_id)
  })

  it('keeps going after one provider failure and records the error', async () => {
    const { store, results } = makeStore([job({ id: 'one' }), job({ id: 'two' })])
    const send = vi.fn()
      .mockRejectedValueOnce(new Error('Email provider returned 429'))
      .mockResolvedValueOnce({ provider: 'resend', providerMessageId: 'msg-2' })
    const summary = await dispatchPatientEmails({ store, provider: { name: 'resend', send }, appOrigin: origin })
    expect(summary).toEqual({ claimed: 2, sent: 1, failed: 1 })
    expect(results[0]).toMatchObject({ id: 'one', ok: false, error: 'Email provider returned 429' })
    expect(results[1]).toMatchObject({ id: 'two', ok: true })
  })

  it('marks an unrenderable job failed without calling the provider', async () => {
    const { store, results } = makeStore([job({ kind: 'review_request' })])
    const send = vi.fn()
    await dispatchPatientEmails({ store, provider: { name: 'resend', send }, appOrigin: origin })
    expect(send).not.toHaveBeenCalled()
    expect(results[0]).toMatchObject({ ok: false, error: 'render_failed' })
  })

  it('drops an invalid reply-to address', async () => {
    const { store } = makeStore([job({ reply_to: 'not-an-email' })])
    const send = vi.fn(async (_message: EmailMessage) => ({ provider: 'resend', providerMessageId: null as string | null }))
    await dispatchPatientEmails({ store, provider: { name: 'resend', send }, appOrigin: origin })
    expect(send.mock.calls[0]![0].replyTo).toBeUndefined()
  })
})
