import { LegalLayout } from '../components/LegalLayout'
import { SUPPORT_EMAIL } from '@/integrations/supabase/client'

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" updated="23 November 2026">
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">1. Using FlowSuite</h2>
        <p>
          By creating an account or using FlowSuite, you agree to these terms and to the Privacy Policy. You must be at
          least 18 years old and authorized to use the service on behalf of the business you register.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">2. Your workspace and data</h2>
        <p>
          Each business is a separate workspace. You are responsible for the accuracy of the information you enter,
          the people you invite, and the permissions you grant them. You must have the right to upload contact details
          and to send messages to those people through the channels you connect.
        </p>
        <p>
          You keep ownership of your business data. You give FlowSuite a limited license to store and process it only
          to provide, secure and support the service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">3. Acceptable use</h2>
        <p>Do not use FlowSuite to:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>send spam, unsolicited bulk messages, or messages that violate platform rules or applicable law;</li>
          <li>harass, defraud, threaten or impersonate someone;</li>
          <li>upload malware, attempt unauthorized access, or interfere with the service or other tenants;</li>
          <li>resell access, reverse engineer the software, or scrape the service without permission;</li>
          <li>use AI outputs as professional, medical, legal or financial advice without qualified review.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">4. Connected channels and approvals</h2>
        <p>
          Some features connect to third-party services such as WhatsApp, Google Calendar, email or telephony
          providers. Your use of those services is also governed by their terms. Where FlowSuite requires approval
          before a message is sent, that approval is a product control, not legal advice; you remain responsible for
          the content you approve.
        </p>
        <p>
          Availability of a channel depends on the provider, your account standing, and any template or permission
          approvals the provider requires.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">5. Plans, payments and renewals</h2>
        <p>
          Paid plans are billed in Indian Rupees through the payment provider shown at checkout when online payments
          are enabled. Prices and limits are displayed before purchase. A subscription becomes active only after the
          payment is verified by our server or a signed provider webhook is received.
        </p>
        <p>
          Plan limits may be enforced by the service. See the <a className="font-medium text-brand-600" href="/refund">Refund &amp; Cancellation</a> page for cancellation and refund information.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">6. AI features</h2>
        <p>
          AI features generate suggestions from information you provide or authorize us to use. Outputs can be
          inaccurate. Review them before publishing or sending, especially for customer-facing messages, pricing and
          claims about your business.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">7. Availability and liability</h2>
        <p>
          We work to keep FlowSuite available and secure, but we do not promise uninterrupted or error-free operation.
          To the extent permitted by law, we are not liable for indirect or consequential losses, lost profits, or
          third-party service outages. Nothing in these terms excludes liability that cannot lawfully be excluded.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">8. Suspension and termination</h2>
        <p>
          You may stop using the service at any time. We may suspend or terminate access if these terms are breached,
          if payment is not made, if a provider requires it, or if needed to protect the service and other users.
          Provisions about ownership, liability and disputes survive termination.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">9. Changes and contact</h2>
        <p>
          We may update these terms as the product changes. The “Last updated” date at the top shows the latest version.
          Questions can be sent to{' '}
          <a className="font-medium text-brand-600" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </section>
    </LegalLayout>
  )
}
