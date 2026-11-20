# Edge Functions

This directory is reserved for trusted server-side code. No function is deployed in Milestone 1 or 2.

## `notify-email` (Milestone 3 foundation)

`notify-email/` plus `_shared/email.ts` provide the email **seam** only. Milestone 3 ships working in-app notifications; this function is not yet wired to an automatic dispatcher. A later milestone will add an outbox over `public.notifications` rows with `delivery_channel = 'email'` and `delivery_status = 'pending'`, then invoke this function from that dispatcher.

- `createEmailProvider()` selects a provider from Supabase secrets. With no credentials it uses a console adapter that makes **no external request**, so a partially configured deployment cannot send mail by accident.
- `EMAIL_PROVIDER=resend` requires `EMAIL_PROVIDER_API_KEY` and `EMAIL_FROM_ADDRESS`; both are server-only.
- Calls require `x-flowsuite-secret` matching `NOTIFY_EMAIL_SECRET`. A missing secret fails closed with HTTP 503.
- The browser bundle never imports these files. No `VITE_*` variable holds a provider key or the internal secret.

Planned functions (each gets its own folder and test):

| Function | Responsibility |
| --- | --- |
| `razorpay-webhook` | Verify signature, enforce idempotency, update subscription entitlements |
| `whatsapp-webhook` | Verify signature, deduplicate by provider message ID, route to conversations |
| `ai-tool-executor` | Validate tenant scope and permissions before running an approved AI tool; log usage |
| `send-campaign` | Check consent and plan limits before dispatching messages |
| `telephony-webhook` | Verify provider signature and manage inbound call state |
| `google-oauth-callback` | Store provider tokens encrypted, scoped to the tenant |

Rules:

- All integration secrets stay here as Supabase secrets — never in `VITE_*` variables or browser code.
- Verify every webhook signature and use idempotency keys for external events.
- Re-check `auth.uid()`, tenant membership and plan entitlements server-side; never trust a client-supplied role.
- Use `service_role` only inside functions, never in the browser.
