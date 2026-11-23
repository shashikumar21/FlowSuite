import { LegalLayout } from '../components/LegalLayout'
import { SUPPORT_EMAIL } from '@/integrations/supabase/client'

export function RefundPage() {
  return (
    <LegalLayout title="Refund & Cancellation" updated="23 November 2026">
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">1. Cancelling a subscription</h2>
        <p>
          You can request cancellation at any time by writing to{' '}
          <a className="font-medium text-brand-600" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>{' '}
          with the business name and the email address used to sign up. We will confirm the effective date in writing.
        </p>
        <p>
          Cancellation stops future renewals. It does not automatically delete your workspace or its data. If you also
          want data deletion, mention that in your request and we will handle it under the Privacy Policy.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">2. Refunds</h2>
        <p>
          Subscription fees are charged for the billing period shown at checkout. Because the service is provided
          continuously during that period, we do not automatically refund partial periods on cancellation.
        </p>
        <p>
          You may ask for a refund if a payment was charged in error, duplicated, or if we fail to provide the paid
          service for a material period and cannot resolve it. Send the payment reference and a short explanation to
          the support address above. We will review each request and respond with our decision.
        </p>
        <p>
          Approved refunds are returned through the original payment provider where possible. Timing depends on the
          provider and your bank.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">3. Failed and disputed payments</h2>
        <p>
          If a payment fails, the subscription is not activated. If a payment is later reversed or disputed, access may
          be paused until the matter is resolved. Contact support before opening a chargeback where possible so we can
          help.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">4. Plan changes and manual plans</h2>
        <p>
          Upgrades and downgrades take effect according to the dates confirmed by the platform admin or shown in your
          workspace. Manually assigned plans, trials and support credits are governed by the terms communicated when
          they are granted.
        </p>
      </section>
    </LegalLayout>
  )
}
