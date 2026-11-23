import { LegalLayout } from '../components/LegalLayout'
import { SUPPORT_EMAIL } from '@/integrations/supabase/client'

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="23 November 2026">
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">1. About this policy</h2>
        <p>
          This policy explains how FlowSuite handles information when you use the app, the public booking and review
          pages, and our support channels. FlowSuite is operated by the team you contracted with; if you signed up
          directly, write to <a className="font-medium text-brand-600" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
        <p>
          This policy is about our own handling of data. Third-party services you connect, such as WhatsApp, Google
          Calendar or your email provider, also have their own privacy terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">2. Information we collect</h2>
        <ul className="ml-5 list-disc space-y-2">
          <li><strong>Account and workspace:</strong> name, email address, phone number, business name, role and preferences.</li>
          <li><strong>Business data you enter:</strong> contacts and leads, appointments, tasks, notes, messages, review requests, invoices and usage logs.</li>
          <li><strong>Integration data:</strong> account identifiers and connection credentials for channels you choose to connect. Provider secrets are kept server-side and are never exposed in the browser bundle.</li>
          <li><strong>Payment data:</strong> plan, order, payment and subscription identifiers and statuses. Card, UPI and bank details are handled by the payment provider, not stored by FlowSuite.</li>
          <li><strong>Technical data:</strong> IP address, browser and device information, timestamps and error logs needed to operate and secure the service.</li>
          <li><strong>AI inputs and outputs:</strong> prompts and generated content you request through AI features, plus token and cost usage logs.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">3. Why we use it</h2>
        <p>We use this information to:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>create and secure your account, enforce roles and keep tenants separated;</li>
          <li>provide the CRM, booking, inbox, automation, reputation and reporting features you use;</li>
          <li>process subscription payments and maintain entitlement records;</li>
          <li>deliver messages you approve through connected channels;</li>
          <li>respond to support requests and investigate faults or abuse;</li>
          <li>improve the product using aggregated or de-identified information where possible.</li>
        </ul>
        <p>
          We rely on your consent where required, on performing our agreement with you to provide the service, and on
          legal obligations where applicable.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">4. Sharing</h2>
        <p>
          We share data only with providers that help us run FlowSuite, and only to the extent needed for the feature
          you use. These include our hosting and database provider, payment provider (when payments are enabled),
          messaging and email providers (when you send through them), calendar providers you connect, and configured AI
          providers. We do not sell personal data or use your customer data for advertising.
        </p>
        <p>
          We may also disclose information if required by law or to protect the rights, safety and integrity of the
          service and its users.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">5. Retention and security</h2>
        <p>
          We keep account and business data while your workspace is active. When you close an account or ask us to
          delete data, we remove it from active systems, subject to legal, tax and dispute-resolution requirements.
          Copies in backups may persist for a limited period before the next backup rotation.
        </p>
        <p>
          Access is controlled through tenant-scoped database policies, role checks and server-side authorization.
          Secrets are stored server-side. No system can be made perfectly secure, so please use strong credentials and
          tell us promptly about suspected unauthorized access.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">6. Your choices and rights</h2>
        <p>
          You can ask to access, correct, export or delete your personal information, object to particular processing,
          or withdraw consent where consent was the basis for it. Some information must be retained to keep the service
          working or to meet legal obligations. Send requests to{' '}
          <a className="font-medium text-brand-600" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
        <p>FlowSuite is not intended for children under 18.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink-900">7. Changes</h2>
        <p>
          We may update this policy as the product changes. The “Last updated” date at the top shows the latest version.
          Material changes will be communicated through the app or by email where appropriate.
        </p>
      </section>
    </LegalLayout>
  )
}
