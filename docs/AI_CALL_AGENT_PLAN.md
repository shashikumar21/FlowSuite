# AI Call Agent Plan (India, Clinic MVP)

Status: **Planning only - not implemented, no hosted migration, no provider configured, no keys stored.**

## Goal

Add an AI call agent for Indian dental/clinic workspaces that can handle inbound calls, capture leads, answer approved FAQs, assist with booking, and later place consented outbound callbacks/reminders. The system must be tenant-scoped, server-authoritative, auditable, and compliant.

## Reality check

- **No fully free production calling in India.** PSTN numbers and call minutes cost money. Trial credits/sandboxes may be used for evaluation only.
- **Outbound calling is regulated.** DND/consent, calling hours, opt-out, and recording disclosure must be enforced before any outbound campaign/reminder.
- **AI must not give medical advice.** It can provide approved clinic information, collect details, and hand off to humans.

## Recommended provider

**Recommended: Exotel (India-first)** for initial production evaluation.
- Pros: India-focused numbers/voice APIs/webhooks, local compliance posture, good fit for India clinics.
- Cons: vendor lock-in if abstraction is weak; verify pricing/feature availability for streaming/recording/transcripts.

**Alternative: Twilio**.
- Pros: mature global APIs, Media Streams ecosystem.
- Cons: India number/regulatory setup and cost/complexity may be higher; verify India-specific requirements.

**Decision:** implement a provider abstraction so Exotel can be first, Twilio can be added later.

## Scope

### Phase 1 - Inbound MVP (recommended first)
- Inbound calls only.
- Languages: **Hindi + English** first; **Telugu** after QA.
- Capabilities: greeting, language selection, approved FAQ answers, capture name/phone/reason/preferred time, create/update contact, create callback task/activity, human handoff/escalation.
- No outbound auto-dial. No medical advice. No AI-confirmed booking mutation unless explicitly enabled in later phase.

### Phase 2 - Booking assist
- Check availability through existing booking RPCs.
- Propose slots; create booking only through trusted server RPCs.
- Require explicit verbal confirmation before booking/reschedule/cancel.
- Send confirmation through approved channel (SMS/WhatsApp/email) only if configured and consented.

### Phase 3 - Consented outbound
- Outbound only for consented callbacks/reminders/follow-ups.
- Enforce DND/opt-out, quiet hours, retry limits, template-approved scripts.
- No cold prospecting auto-calls.

## Proposed architecture

### Client/UI (no secrets)
- New module: `src/modules/voice-agent/`
- Routes: `/app/voice-agent`, `/app/voice-agent/calls`, `/app/voice-agent/agents`, `/app/voice-agent/settings`
- UI: agent config, provider credential references, call logs, transcript viewer, handoff queue, outcome filters.
- Browser has SELECT only; all writes through trusted RPCs or Edge Functions.

### Database (new additive migration, approval-gated)
Create new tables only; do not edit earlier migrations:

- `voice_agents` - tenant, name, status, languages, greeting, approved FAQ/knowledge refs, business hours, handoff rules, booking mode.
- `voice_provider_connections` - tenant, provider (`exotel|twilio`), credential ref names, phone numbers, webhook status; **no raw secrets**.
- `call_sessions` - tenant, direction, provider call id, from/to, contact_id, appointment_id, status, started/ended, duration, outcome, consent flags, recording ref.
- `call_transcripts` - tenant, call_session_id, speaker (`caller|agent|staff|system`), text, language, confidence, timestamp.
- `call_events` - tenant, call_session_id, event_type, payload_json (sanitized), created_at.
- `call_handoffs` - tenant, call_session_id, reason, assigned_to, status, notes.

RLS: SELECT only for `has_tenant_access(tenant_id)`. Revoke table write grants from client roles. Writes through SECURITY DEFINER RPCs with `set search_path = ''`, fully qualified names, membership checks, and audit logs.

### Edge Functions (server-side, approval-gated deploy)
- `voice-webhook` - verifies provider signature, normalizes events, dedupes by provider event/call id, enqueues processing.
- `voice-orchestrator` - handles call state, STT/LLM/TTS/tool calls, language detection/switching, handoff, logging.
- `voice-outbound` - creates consented outbound calls through provider adapter; enforces DND/quiet hours/limits.

Server secrets only (Supabase secrets / env, never `VITE_*`): provider API keys/tokens, webhook secrets, STT/TTS/LLM keys.

### Provider abstraction

```ts
interface VoiceProviderAdapter {
  verifyWebhook(req): Promise<VerifiedEvent>
  startInboundResponse(event): Promise<void>
  placeOutboundCall(input): Promise<ProviderCallRef>
  transferCall(input): Promise<void>
  endCall(input): Promise<void>
}
```

Implement `ExotelAdapter` first; keep `TwilioAdapter` behind same interface.

## Safety and compliance

- **No medical advice.** Use approved clinic knowledge and escalation scripts.
- **Consent/recording notice.** Play disclosure at call start where required; store consent outcome.
- **DND/opt-out.** Check suppression/DND before outbound; honor STOP/opt-out immediately.
- **Business hours/quiet hours.** Block or schedule outbound outside allowed windows.
- **Human handoff.** Escalate on clinical questions, anger, confusion, low confidence, booking conflicts, or explicit request.
- **Auditability.** Log tool calls, booking/contact mutations, handoffs, and outcome. No invented metrics.
- **PII/security.** No secrets in browser. Sanitize webhook payloads. Restrict transcript access by tenant/RLS.

## CRM/Booking integration

- Reuse existing trusted RPCs where possible: contact search/create/update, activities, tasks, booking availability/booking RPCs.
- AI may propose actions; server validates and executes.
- Booking confirmation should require explicit confirmation and be logged as an `appointment_event`/audit entry.

## Suggested implementation order

1. **Plan + provider selection** - confirm Exotel/Twilio, number type, languages, call flows.
2. **DB design/migration draft** - additive schema, RLS, RPC contracts, tests.
3. **Provider webhook skeleton** - signature verification, dedupe, event log.
4. **Inbound MVP** - FAQ + lead capture + callback task + handoff.
5. **Transcript/call log UI** - tenant-scoped, read-only.
6. **Booking assist** - server-validated slot checks and confirmed booking.
7. **Outbound consented calls** - reminders/callbacks with DND/quiet hours.

## Open decisions needed from owner

1. Provider: **Exotel** or **Twilio**?
2. First launch: **inbound only** or inbound + consented outbound callbacks?
3. Languages for MVP: **Hindi + English** or include **Telugu** day 1?
4. Booking authority: capture lead/callback only, or allow AI-assisted booking confirmation?
5. Knowledge source: approved FAQ doc, website content, or staff-authored answers?
6. Phone number: new clinic number or existing number port/integration?
7. Recording/transcript retention policy and access roles.

## Approval gates

Before implementation proceeds beyond planning:
- Approve provider and scope.
- Approve additive DB migration before applying to hosted.
- Approve Edge Function deployment and secrets setup.
- Approve any outbound calling enablement after compliance review.
