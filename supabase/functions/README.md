# Edge Functions

This directory is reserved for trusted server-side code. No function is deployed in Milestone 1 or 2.

**Deployment status:** the per-section headings below describe the original milestone state and are not kept current. See `docs/HOSTED_STATE.md` for the authoritative list of functions actually deployed to the hosted project. As of 2026-11-23 that includes `ai-chat`, `website-generate`, `calendar-oauth-start`, `calendar-oauth-callback`, `review-suggest`, `integrations-vault-save`, `calendar-sync-appointment`, `review-request-send-whatsapp`, and the three Razorpay billing functions. The WhatsApp-send, WhatsApp-webhook, follow-up worker and telephony webhook functions remain local code only.

## `notify-email` (Milestone 3 foundation)

`notify-email/` plus `_shared/email.ts` provide the email **seam** only. Milestone 3 ships working in-app notifications; this function is not yet wired to an automatic dispatcher. A later milestone will add an outbox over `public.notifications` rows with `delivery_channel = 'email'` and `delivery_status = 'pending'`, then invoke this function from that dispatcher.

- `createEmailProvider()` selects a provider from Supabase secrets. With no credentials it uses a console adapter that makes **no external request**, so a partially configured deployment cannot send mail by accident.
- `EMAIL_PROVIDER=resend` requires `EMAIL_PROVIDER_API_KEY` and `EMAIL_FROM_ADDRESS`; both are server-only.
- Calls require `x-flowsuite-secret` matching `NOTIFY_EMAIL_SECRET`. A missing secret fails closed with HTTP 503.
- The browser bundle never imports these files. No `VITE_*` variable holds a provider key or the internal secret.

## Milestone 4 (local code only — nothing here is deployed)

| Function | Responsibility | Status |
| --- | --- | --- |
| `ai-chat` | Anonymous website widget endpoint. Resolves a 64-hex public key to an active agent, enforces the DB token limit, uses the vendor-neutral provider adapter and stores messages via service-role RPCs. | Local code + unit tests |
| `whatsapp-webhook` | Meta GET handshake and HMAC-verified POST ingestion. Maps WABA phone-number IDs to tenants via `channel_credentials`, dedupes by Meta message ID, stores inbound rows and sends one AI reply when allowed. | Local code + unit tests |
| `whatsapp-send` | Internal sender for trusted callers. Requires the shared internal secret, verifies the contact belongs to the tenant, resolves that tenant's secret reference and enforces opt-out/consent/template rules before calling the Graph API. | Local code + unit tests |
| `ai-follow-up-worker` | Small internal worker that claims due follow-up jobs, re-checks consent and sends one approved WhatsApp template per job via the official Graph API. Not the Milestone 5 automation engine. | Local code + unit tests |
| `telephony-webhook` | Inbound voice **foundation only**: verifies an HMAC webhook signature over the raw body, dedupes the call event and records a call session plus log in the tenant's CRM. No STT, TTS, audio playback or dialling. | Local code + unit tests; no live provider/audio tests |

Both chat entry points also run lead qualification after the reply is stored. `qualification.ts` uses strict structured output and the validated `qualifyLeadSchema`, never invents a lead score, and records an assessment through a service-role RPC. A follow-up is queued only for `future_follow_up` classification with an eligible channel, an active tenant sequence and an existing opt-in (the RPC re-checks consent). Qualification is non-fatal: a provider, schema or store failure never removes an already delivered reply.

Migrations `0015_milestone4_ai_service_rpcs.sql` (agent lookup, usage-limit checks, consent writes, handoff) and `0016_milestone4_ai_qualification_rpcs.sql` (service-role assessment recording and consent-gated follow-up enqueue) must be applied to the hosted database before these functions are deployed. Website chat and provider webhooks have no end-user JWT, so the member-facing RPCs in migration 0014 cannot be used for those paths.

Required Supabase secrets (never `VITE_*`):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `AI_PROVIDER=openai`, `OPENAI_API_KEY`, optional `OPENAI_MODEL`, `OPENAI_BASE_URL`, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`
- `AI_CHAT_ALLOWED_ORIGINS` (comma-separated; omit for same-origin/dev)
- `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, optional `WHATSAPP_ACCESS_TOKEN` fallback
- `WHATSAPP_SEND_SECRET` (shared secret for the internal sender)
- `AI_FOLLOW_UP_WORKER_SECRET` (shared secret for the follow-up worker)
- `VOICE_PROVIDER` (`exotel` or `other`), `VOICE_WEBHOOK_SECRET`, optional `VOICE_SIGNATURE_HEADER` (defaults to `x-flowsuite-signature`). Set the header to your provider's actual signature header before deployment.
- Per-tenant WhatsApp token secret names must match `channel_credentials.secret_ref`

With no provider key the functions fail closed with HTTP 503 and make no live provider call. The telephony webhook also fails closed (503) without an explicit provider and secret. No Edge Function has been deployed, and voice has **not** been tested end-to-end with a real provider or audio.

## Razorpay billing (local code only — nothing here is deployed)

Migration `0037_billing_razorpay.sql` adds `billing_orders`, a webhook idempotency ledger, tenant-scoped entitlement RPCs and service-role activation RPCs. Three functions implement the flow:

| Function | Responsibility |
| --- | --- |
| `razorpay-create-order` | Manager+ only. Creates a Razorpay order with server-side keys and records it. No payment is captured here. |
| `razorpay-verify-payment` | Manager+ only. Verifies the checkout signature and activates the subscription through a service-role RPC. |
| `razorpay-webhook` | Verifies the HMAC over the raw body with `x-razorpay-signature`, dedupes with `x-razorpay-event-id`, then activates or fails the order. |

Required Supabase secrets (never `VITE_*`):

- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` — server-to-server order creation and payment signature verification. The public key id is returned to the browser only with a created order because Razorpay Checkout requires it.
- `RAZORPAY_WEBHOOK_SECRET` — HMAC verification of incoming webhooks.

All three functions fail closed with HTTP 503 when their keys are absent. No subscription is activated without either a verified checkout signature or a verified webhook. Entitlements are visible in **Settings → Subscription** but are not yet enforced as hard feature blocks.

Planned functions (each gets its own folder and test):

| Function | Responsibility |
| --- | --- |
| `ai-tool-executor` | Validate tenant scope and permissions before running an approved AI tool; log usage |
| `send-campaign` | Check consent and plan limits before dispatching messages |
| `google-oauth-callback` | Store provider tokens encrypted, scoped to the tenant |

Rules:

- All integration secrets stay here as Supabase secrets — never in `VITE_*` variables or browser code.
- Verify every webhook signature and use idempotency keys for external events.
- Re-check `auth.uid()`, tenant membership and plan entitlements server-side; never trust a client-supplied role.
- Use `service_role` only inside functions, never in the browser.
