# Milestone 4 admin console UI

The Milestone 4 backend was already implemented; these screens make it usable from the browser.

## Where to find it

Sign in at `http://localhost:5173`, then use the sidebar:

- **Automation → AI Agents** — create/edit agents, set status, language, tone, token limit, escalation recipient, allowed tools and approved knowledge; copy the public widget key and embed snippet; test the widget against the real `ai-chat` endpoint.
- **Automation → AI Conversations** — review AI-tagged conversations and lead assessments, hand off to a teammate, pause/resume/close automation, record consent, queue follow-ups, and inspect sequence steps and jobs.
- **Settings → Integrations** — channel credential references, message templates and the WhatsApp/telephony/chat webhook URLs.

These options only render after authentication and tenant selection. The login screen has no app sidebar.

## What actually works now

All reads and writes use the RPCs and tables in migration `0014`, which is applied to the hosted project. No new migration or deployment is needed for the console itself.

- Agent config writes via `ai_upsert_agent`, `ai_set_agent_status`, `ai_set_tool`.
- Knowledge writes via `ai_upsert_knowledge`; inactive entries are never served to the public widget.
- Handoff and automation status via `ai_handoff_conversation` and `ai_set_conversation_ai_status`.
- Consent via `ai_set_consent`; follow-up queueing via `ai_enqueue_follow_up`.
- Credential references via `ai_upsert_credential` (secret **name** only) and templates via `ai_upsert_template`.
- Owner/admin gating through the database RPC `can_manage_ai`; RLS and SECURITY DEFINER RPCs remain authoritative.

No numbers are fabricated: usage, assessments, jobs and statuses come from tenant-scoped tables. The chat preview calls the real endpoint and shows a fail-closed error if it is not deployed or configured.

## Still required for live WhatsApp/OpenAI

The console does not make live integrations work by itself. Still needed, with your approval:

1. Apply local migrations `0015` and `0016` to hosted Supabase.
2. Deploy the Edge Functions and set server-only secrets (OpenAI key, Meta app secret/verify token/access token, webhook secrets).
3. Add the public website origin to `AI_CHAT_ALLOWED_ORIGINS`, deploy the widget script, and configure Meta webhooks/templates.
4. Provide a scheduler for the follow-up worker.

Until then the Integrations page shows *not configured* and the widget test reports a service-unavailable error rather than pretending to work.

## Verification

- `npm run typecheck` — pass
- `npm test` — 168 tests passed in 23 files
- `npm run lint` — warnings only, no errors
- `npm run build` — pass
