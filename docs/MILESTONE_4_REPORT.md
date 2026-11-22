# Milestone 4 — AI Communication & WhatsApp Automation

Status: **local implementation complete; no live integrations, no Edge Function deployments, no production claims.**

Milestone 5 (workflow builder / automation engine) has **not** been started.

## 1. Checkpoint commits (all pushed to `master`)

| Commit | Scope |
| --- | --- |
| `7e988a4` | AI DB foundation, types and hosted SQL security suite |
| `2e6af2d` | Vendor-neutral provider abstraction, safety rules, usage limits, tenant-scoped tool executor |
| `5b50676` | Local website chatbot + WhatsApp Cloud API functions, webhook verification/dedupe, service-role RPCs (0015) |
| `6708375` | Lead qualification, follow-up worker, handoff wiring, service-role qualification RPCs (0016) |
| `b09ae6a` | Inbound voice webhook foundation (records only) |
| `2fd45e5` | SQL suite for the 0016 qualification/follow-up RPCs |

The working tree was clean at `2fd45e5`; the only subsequent change is this report.

## 2. Files and migrations

### Migrations

| Migration | Applied to hosted Supabase? | Contents |
| --- | --- | --- |
| `supabase/migrations/0014_milestone4_ai_communication.sql` | **Yes** | AI agents, knowledge, tools, credentials, templates, consents, handoffs, assessments, usage logs, follow-up sequences/steps/jobs, call sessions/logs; RLS, grants, member-facing and core service-role RPCs; public-safe agent lookup |
| `supabase/migrations/0015_milestone4_ai_service_rpcs.sql` | **No — local only** | Service-role agent lookup, usage-limit check, consent write, conversation handoff |
| `supabase/migrations/0016_milestone4_ai_qualification_rpcs.sql` | **No — local only** | Service-role assessment recording and consent/channel-gated follow-up enqueue |

### Local application code (`src/modules/ai/`)

- `index.ts`, `providers/` (`types.ts`, `openai.ts`, `errors.ts`, `retry.ts`, `pricing.ts`, `index.ts`) — vendor-neutral completion API, OpenAI adapter, retries, token/cost estimation, fail-closed configuration.
- `safety.ts` — clinical escalation, English/Hindi/Telugu rules, strict chat-response schema.
- `tools/` (`schemas.ts`, `executor.ts`, `index.ts`) — allowlisted tool schemas and tenant-scoped executor; mutating tools require confirmation and validated RPC writes.
- `usage.ts` — authoritative token-limit check and usage-record builder.
- Tests: `providers/openai.test.ts`, `safety.test.ts`, `tools/executor.test.ts`, `usage.test.ts`, `edge.test.ts`, `whatsapp.test.ts`, `store.test.ts`, `qualification.test.ts`, `voice.test.ts`.

### Edge Functions (all local code only — nothing deployed)

- `_shared/http.ts`, `_shared/ai/` — `provider.ts`, `chat.ts`, `store.ts`, `qualification.ts`, `follow_up.ts`, `whatsapp.ts`, `whatsapp_send.ts`, `whatsapp_inbound.ts`, `voice.ts`.
- `ai-chat/index.ts` — anonymous website chatbot endpoint (CORS-allowlisted), agent lookup, usage gate, strict JSON reply, message persistence, qualification, optional consent recording.
- `whatsapp-webhook/index.ts` — Meta GET handshake and HMAC-verified POST, tenant mapping from WABA phone-number ID, dedupe, inbound storage, AI reply and Graph API send.
- `whatsapp-send/index.ts` — internal sender; shared secret, contact/tenant check, tenant secret reference, opt-out/consent/template gates.
- `ai-follow-up-worker/index.ts` — internal worker; claims due jobs, re-checks consent, sends one approved template via Graph API, completes the job.
- `telephony-webhook/index.ts` — **foundation only**; verifies HMAC over the raw body, dedupes, records call session and call log. No STT/TTS/audio/dialling.
- Documentation: `supabase/functions/README.md`, `.env.example`.

### SQL tests

- `supabase/tests/milestone4_ai_communication.sql` — executed hosted: **65/65**.
- `supabase/tests/milestone4_ai_service_rpcs.sql` — written for 0015, **not yet executed**.
- `supabase/tests/milestone4_ai_qualification_rpcs.sql` — written for 0016, **not yet executed**.

## 3. Environment variables and secrets

Browser-safe (from `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_APP_NAME`, `VITE_SUPPORT_EMAIL`. No provider key, service-role key, internal secret or database credential is exposed through `VITE_*`.

Server-only Supabase secrets required before any deployment:

| Secret | Used by |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | all M4 functions |
| `AI_PROVIDER=openai`, `OPENAI_API_KEY` | `ai-chat`, `whatsapp-webhook` |
| `OPENAI_MODEL`, `OPENAI_BASE_URL`, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES` | optional provider tuning |
| `AI_CHAT_ALLOWED_ORIGINS` | `ai-chat` CORS allowlist |
| `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | `whatsapp-webhook` |
| `WHATSAPP_ACCESS_TOKEN` | optional fallback; per-tenant token names come from `channel_credentials.secret_ref` |
| `WHATSAPP_SEND_SECRET` | `whatsapp-send` internal shared secret |
| `AI_FOLLOW_UP_WORKER_SECRET` | `ai-follow-up-worker` internal shared secret |
| `VOICE_PROVIDER` (`exotel` or `other`), `VOICE_WEBHOOK_SECRET`, `VOICE_SIGNATURE_HEADER` | `telephony-webhook` |

No secrets are present in the repository or in any local `.env` file.

### Free provider option (Groq)

The OpenAI adapter is transport-compatible with any OpenAI-style chat endpoint.
For a no-cost deployment, point it at Groq's free tier instead of OpenAI — no
code change is required:

```bash
supabase secrets set \
  OPENAI_BASE_URL='https://api.groq.com/openai/v1' \
  OPENAI_MODEL='openai/gpt-oss-120b' \
  OPENAI_API_KEY='<groq gsk_ key>' \
  --yes
supabase functions deploy ai-chat --no-verify-jwt --yes \
  --import-map supabase/functions/import_map.json
```

`AI_PROVIDER` stays `openai` — it selects the adapter, not the vendor. Free-tier
limits are per organization (Groq's current free plan: 30 RPM / 1,000 RPD for
`gpt-oss` models); check the provider's rate-limit page before going live. The
`gpt-oss` models support strict JSON schemas, which `ai-chat` requires.

## 4. External accounts and permissions needed before live use

- **OpenAI** API key with access to a structured-output-capable chat model; billing/limit configured.
- **Meta WhatsApp Business**: WABA with a phone number ID, Meta app secret, webhook verify token, webhook subscribed to `messages`, and approved message templates for outside-the-24-hour-window sends. Official Graph API only — no unofficial WhatsApp library is used.
- **Telephony provider** (e.g. Exotel) account with a webhook signing secret and account identifier, if inbound voice is to be enabled. The exact signature header/format must be configured via `VOICE_SIGNATURE_HEADER`; the parser is intentionally generic.
- **Supabase**: service-role key available to Edge Functions, secrets set through the dashboard or `supabase secrets set`, and migrations 0015/0016 applied by the project owner.
- **Domain/CORS**: the live website origin added to `AI_CHAT_ALLOWED_ORIGINS`.
- **Approved message templates** in `message_templates` (`status = 'approved'`) for every follow-up sequence step.

## 5. Working features (local code + unit tests)

- Provider abstraction with structured output, retries, token/cost tracking, tenant limits and English/Hindi/Telugu prompts. Fail-closed with no key.
- Clinical questions are never sent to the provider: fixed escalation reply plus handoff signal.
- Website chatbot orchestration: anonymous public-key lookup, channel/contact/conversation/message writes via service-role RPCs, usage logging, consent recording.
- WhatsApp inbound: GET handshake, raw-body HMAC verification, WABA-to-tenant mapping, dedupe by Meta message ID, inbound persistence, one AI reply, consent/opt-out/template-gated Graph API send.
- Lead qualification: strict schema, validated classification only, no invented lead scores, assessment recorded via service-role RPC.
- Follow-ups: queued only for `future_follow_up` with an active sequence, matching channel and existing opt-in; job claim/opt-out skip/approved-template send/job completion; duplicate suppression.
- Handoff: AI-requested and clinical escalations route to an active member through a service-role RPC.
- Inbound voice foundation: verified, deduplicated call events recorded as call sessions and logs. No AI voice behavior is claimed.
- Multi-tenant isolation, RLS, allowlisted tools, audit logs and idempotency are preserved throughout.

## 6. Integrations still awaiting credentials or approval

- Live OpenAI completion calls (no key configured).
- Live Meta Graph API sends and real Meta webhook delivery (no WABA credentials, templates or deployed webhook URL).
- Live telephony webhook delivery, STT, TTS, audio playback and dialling (no provider account; foundation records events only).
- Automated email dispatch — the Milestone 3 `notify-email` seam remains unwired by design.
- Applying migrations 0015/0016 to hosted Supabase and deploying any Edge Function — **requires your explicit approval**.
- A scheduler/cron to invoke `ai-follow-up-worker` with due job IDs (the worker is manual/internal for now).

## 7. Tests executed and results

### Executed locally

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass, no errors |
| `npm test` | **162 tests passed** in 21 files (final run) |
| `npm run lint` | pass with pre-existing React Fast Refresh / hook warnings only; no errors and no new M4 warnings |
| `npm run build` | pass; only the pre-existing >500 kB chunk advisory |
| `git diff --check` | clean |
| Temporary Deno-shim `npx tsc -p tsconfig.edge.json --pretty false` | pass over `src/**` and all `supabase/functions/**` entry points (shim removed afterwards) |

Focused suites: chatbot/provider/WhatsApp `edge.test.ts` 12/12, qualification/follow-up `qualification.test.ts` 12/12, voice `voice.test.ts` 11/11, Meta helpers `whatsapp.test.ts` 8/8.

### Executed on hosted Supabase (SQL Editor, "Run without RLS")

- `milestone4_ai_communication.sql`: **65/65 checks passed**.
- `foundation_rls.sql`: clean after inline adaptation for one pre-existing real business.
- `milestone2_crm.sql` 37/37; `contact_import_export.sql` 33/33; `milestone3_booking.sql` 38/38; `crm_lead_enrichment.sql` 17/17.

All hosted suites ran inside a transaction and were rolled back.

### Written but not executed

- `supabase/tests/milestone4_ai_service_rpcs.sql`
- `supabase/tests/milestone4_ai_qualification_rpcs.sql`

These require migrations 0015 and 0016 to be applied first.

## 8. Limitations and security risks

- **No live provider calls were made.** OpenAI, Meta and telephony integrations are unverified end-to-end. No production claim is made.
- **No Edge Function is deployed.** Local TypeScript is type-checked via a temporary Deno shim because Deno is not installed in this environment; Deno runtime behavior has not been exercised.
- **Voice is records-only.** There is no STT, TTS, audio handling or outbound dialling. The generic field parser must be adapted and verified against a real provider before use.
- **Follow-up worker needs a caller.** It accepts explicit job IDs; no scheduler or outbox dispatcher is included (that belongs to the next milestone).
- **Qualification is best-effort.** A provider/schema/store failure is logged and surfaced in the outcome but never removes an already delivered reply.
- **No AI-driven booking confirmation.** The tool executor is tenant-scoped and validated, but chat orchestration does not expose booking mutation to the model; bookings remain on trusted booking RPCs only.
- **Templates must be approved** in the tenant's `message_templates` before outside-window WhatsApp sends; missing templates fail the job.
- Edge Functions use the service-role key by design. Signature verification, tenant mapping, consent checks and DB dedupe are the compensating controls; misconfigured secrets would disable those gates, so deployment requires owner review.
- Usage limits are authoritative in the database; cost estimates are provider-adapter approximations, not billing figures.

## 9. Exact next commands

Only after you approve applying migrations and deploying:

1. In the hosted Supabase SQL Editor (with **Run without RLS**), run in order:
   - `supabase/migrations/0015_milestone4_ai_service_rpcs.sql`
   - `supabase/migrations/0016_milestone4_ai_qualification_rpcs.sql`
2. In the same SQL Editor, run and confirm rollback-only results:
   - `supabase/tests/milestone4_ai_service_rpcs.sql` (expect 8 checks passed)
   - `supabase/tests/milestone4_ai_qualification_rpcs.sql` (expect 11 checks passed)
3. Set server secrets (never `VITE_*`), for example:
   ```sh
   supabase secrets set AI_PROVIDER=openai
   supabase secrets set OPENAI_API_KEY='<your-key>'
   supabase secrets set AI_CHAT_ALLOWED_ORIGINS='https://your-site.example'
   supabase secrets set WHATSAPP_VERIFY_TOKEN='<token>' WHATSAPP_APP_SECRET='<secret>'
   supabase secrets set WHATSAPP_SEND_SECRET='<random>' AI_FOLLOW_UP_WORKER_SECRET='<random>'
   supabase secrets set VOICE_PROVIDER=exotel VOICE_WEBHOOK_SECRET='<secret>'
   ```
4. Only after the above, and only with your approval, deploy the local functions:
   ```sh
   supabase functions deploy ai-chat
   supabase functions deploy whatsapp-webhook
   supabase functions deploy whatsapp-send
   supabase functions deploy ai-follow-up-worker
   supabase functions deploy telephony-webhook
   ```
5. Configure tenant rows in `channels` / `channel_credentials` / `message_templates` / `communication_consents`, then perform controlled live tests with a sandbox provider account before any production use.

Until steps 1–5 are completed and verified, this milestone is a tested local foundation, not a live integration.
