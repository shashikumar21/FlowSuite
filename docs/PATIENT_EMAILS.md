# Patient emails

Automatic emails to patients for the clinic package: booking confirmations,
reschedule and cancellation notices, reminders before a visit, and email review
requests after a completed visit.

**Status (2026-11-24):** migration `0044_patient_email_outbox.sql` is **applied to
hosted**, `patient-email-dispatch` is **deployed** (ACTIVE v1, `verify_jwt=false`,
`import_map=true`) and its non-provider secrets are set. A rolled-back demo-tenant
smoke test passed and the dispatcher returns `email_not_configured` (0 claimed).
There is **no email provider configured and no cron job**, so nothing sends yet.
Real email needs explicit approval (go-live steps 1 and 3 below).

## How it works

1. A tenant switches emails on under **Booking → Booking page → Patient emails**
   (`patient_email_settings`, all toggles default off; manager+ only via
   `patient_email_update_settings`, audit logged).
2. Triggers on `appointments` write rows to `patient_email_outbox`:
   - new booking → `booking_confirmation` now, `appointment_reminder` at
     *start − N hours* (skipped if that is under 15 minutes away);
   - time changed → pending reminder withdrawn, `booking_rescheduled` + new reminder;
   - cancelled / completed / no-show → pending emails withdrawn; cancelled also
     sends `booking_cancelled`.
   This works for every write path (public booking page, staff, calendar) because
   it is a trigger, not an RPC change.
3. Email review requests reuse the existing workflow runner (`0035`): an active
   *appointment completed* workflow with a `send_review_request` action on the
   **email** channel creates a `review_requests` row. When it becomes `approved`
   (manually, or immediately if the tenant enabled auto-approve) it is queued at
   its `scheduled_for` time. On send, the review request is marked `sent`.
4. `patient-email-dispatch` runs every 5 minutes, calls
   `patient_email_claim_due` (service role only, `FOR UPDATE SKIP LOCKED`), which
   re-checks each row at send time: appointment still active, time unchanged,
   toggle still on, review request still approved, no email opt-out in
   `communication_consents`. Stale rows become `skipped`. Failures retry with
   backoff (5, 20, 45, 80 min) and become `failed` after 5 attempts.
5. The dispatcher refuses to claim anything while the console email adapter is
   active, so rows wait as `pending` instead of being falsely marked sent.

Patients only receive email when they gave an address (booking form or CRM contact).

## Security

- Browser code has `SELECT` only on both tables, and the RLS policy is
  `can_manage_bookings(tenant_id)` — owner/admin/manager only, not every tenant
  member. No client insert/update/delete.
- Enqueue/claim/result/opt-out functions are revoked from `anon` and
  `authenticated`; claim/result/opt-out are granted to `service_role` only.
  The opt-out helper is re-checked at claim time for **every** email kind.
- Auto-approving an email review request writes a
  `patient_email.review_auto_approved` audit row, so the manager approval gate
  is not silently bypassed.
- Cancellation emails re-check the confirmations toggle and that the appointment
  is still in the future at claim time.
- The dispatcher authenticates with `x-flowsuite-secret` (constant-time compare)
  and fails closed with 503 when unconfigured. A wrong secret returns 401.
- All patient/tenant text is HTML-escaped; review links must be the FlowSuite
  `/r/<token>` page or an `http(s)` URL.
- The outbox list in the UI masks addresses.

## Go-live steps (each needs owner approval)

1. **Email provider (NOT DONE — needs approval).** Create a Resend account, verify
   the clinic/brand sending domain, then set Supabase secrets (values never in
   chat or git): `EMAIL_PROVIDER=resend`, `EMAIL_PROVIDER_API_KEY`,
   `EMAIL_FROM_ADDRESS` (e.g. `FlowSuite <bookings@flow-suit.com>`). Until this
   is set the dispatcher does nothing.
2. **Dispatcher secrets — DONE (2026-11-24).** `PATIENT_EMAIL_CRON_SECRET` (random
   64-hex value, never printed) and `APP_PUBLIC_URL=https://flow-suite-two.vercel.app`
   are set on hosted.
3. **Migration — APPLIED (2026-11-24)** via
   `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0044_patient_email_outbox.sql`.
   Preflight confirmed the objects were absent and all dependency columns exist;
   post-apply verification confirmed RLS, manager-only policies, `postgres` owner,
   `SECURITY DEFINER` + `search_path=''`, and all five triggers. A behaviour smoke
   test on the demo tenant was run inside a transaction and rolled back (0 rows
   persisted). No backup file exists because the schema dump needs Docker.
4. **Deploy — DONE (2026-11-24):** `supabase functions deploy patient-email-dispatch
   --project-ref grkzontnyjnhijmphypo --no-verify-jwt --import-map supabase/functions/import_map.json`.
   Verified ACTIVE v1, `verify_jwt=false`, `import_map=true`. Valid-secret call
   returns `{"ok":false,"reason":"email_not_configured","claimed":0}`;
   wrong-secret call returns 401.
5. **Schedule (NOT DONE).** SQL editor; enable the `pg_cron` and `pg_net` extensions first.
   Store the same cron secret in Vault so it is not written into the job text:

   ```sql
   select vault.create_secret('<same value as PATIENT_EMAIL_CRON_SECRET>', 'patient_email_cron_secret');

   select cron.schedule(
     'patient-email-dispatch',
     '*/5 * * * *',
     $$
     select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/patient-email-dispatch',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-flowsuite-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'patient_email_cron_secret')
       ),
       body := '{}'::jsonb
     );
     $$
   );
   ```

6. **Smoke test (NOT DONE — after step 1)** on the demo tenant: switch
   confirmations on, book via the public page with your own address, confirm the
   email arrives and the row shows *Sent*; cancel it and confirm the cancellation
   email. A read-only/rolled-back SQL smoke test already passed; a real delivery
   test needs a provider and explicit approval.

## Known gaps

- Emails do not yet carry a self-service reschedule/cancel link; patients are
  told to call or reply. Adding one needs a token-based "load booking" RPC and
  `/book/:slug?manage=` support in `PublicBookingPage`.
- No unsubscribe link in review-request emails yet; opt-outs are honoured only
  when recorded in `communication_consents` (now checked for all email kinds).
- No self-service patient opt-out URL; the reply-to address is validated for
  syntax only (unverified external reply-to is a config risk for the owner).
- No cron rate limiting beyond the 25-per-run claim cap; the dispatcher holds the
  service-role key, so `PATIENT_EMAIL_CRON_SECRET` must stay secret and be rotated
  if it ever leaks.
- No hosted backup file exists (schema dump requires Docker); migration `0044`
  is additive and was applied inside its own transaction with a verified rollback
  plan recorded in this repo.

## Files

- `supabase/migrations/0044_patient_email_outbox.sql`
- `supabase/functions/_shared/patient_email.ts` — templates + dispatch loop
- `supabase/functions/patient-email-dispatch/index.ts`
- `src/modules/booking/patientEmails.ts`, `components/PatientEmailSettingsCard.tsx`
- `src/modules/booking/patientEmail.test.ts` (17 tests)
- `src/types/database.ts` — additive types
