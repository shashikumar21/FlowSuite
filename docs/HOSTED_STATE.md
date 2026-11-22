# Hosted Supabase state — do not duplicate or overwrite

This file records the **current hosted state** so future work does not re-apply
migrations or re-deploy functions that already exist. Treat it as a snapshot;
verify with the read-only commands below before changing anything.

Snapshot taken: 2026-11-22.

## Project

| Field | Value |
| --- | --- |
| Project ref | `grkzontnyjnhijmphypo` |
| Project name | `FlowSuite` |
| URL | `https://grkzontnyjnhijmphypo.supabase.co` |
| Primary tenant | `06a77082-53a2-4e9c-9c35-3214a76c9ba6` (Abhishek Dental Care and Poly Clinic) |
| Demo tenant | `09902c67-e585-427c-98be-df91c211e864` (`Demo Dental Clinic`), demo user `ce68894b-0ae5-44d8-9d75-f1fa10bf2cba` |
| Catalog inventory | 64 public tables, all with RLS enabled; 115 `SECURITY DEFINER` functions; 12 `sales_*`/`can_manage_sales_agent` RPCs |

## Migrations already applied to hosted

The hosted migration-history table was empty, so `supabase db push` was
deliberately never used. Migrations were applied manually through the CLI SQL
query endpoint / dashboard. **Do not re-apply any of these.**

- `0001_core_foundation.sql` → `0013_crm_lead_enrichment.sql`
- `0015_milestone4_ai_service_rpcs.sql`
- `0016_milestone4_ai_qualification_rpcs.sql`
- `0017_ai_sales_agent.sql` — hosted variant of two statements was corrected first (commit `ccddd6c`)
- `0018_sales_prospect_contact_conversion.sql` — conversion RPC plus a forward-only fix for the misordered `prospects.converted_contact_id` foreign key from `0017` (commit `1e3ff75`)

`0014_milestone4_ai_communication.sql` exists in the repo and is part of the
migration sequence; verify before assuming it is absent from hosted. No
migration may be edited retroactively — corrections go in a new numbered file.

Verified hosted ACLs after `0018`: `anon_rpc_exec:false`,
`anon_table_select:false`, `auth_rpc_exec:true`, `auth_table_select:true`,
`auth_table_insert:false`. `sales_convert_prospect_to_contact` is
`SECURITY DEFINER`, returns `uuid`, and is executable only by `authenticated`.

## Edge Functions already deployed

`supabase functions list` reported exactly one deployed function:

| Slug | Status | Version | verify_jwt | import_map | Source hash (sha256) |
| --- | --- | --- | --- | --- | --- |
| `ai-chat` | `ACTIVE` | `9` | `false` | `true` | `d3b5528f210603b1a378d057e6855718b19193441630a7328e44c0101e19df35` |

It was deployed with:
`supabase functions deploy ai-chat --no-verify-jwt --yes --import-map supabase/functions/import_map.json`

**Do not re-deploy it.** Compare the hash above with `supabase functions list`
before considering any future change. Other function folders in the repo
(`whatsapp-webhook`, `whatsapp-send`, `ai-follow-up-worker`,
`telephony-webhook`) are **not** deployed. No scheduler is configured.

## Server-side secrets (names only — never values)

- `AI_PROVIDER=openai` (selects the OpenAI-compatible adapter)
- `OPENAI_BASE_URL` — currently the Groq OpenAI-compatible endpoint
- `OPENAI_MODEL` — currently `openai/gpt-oss-120b`
- `OPENAI_API_KEY` — currently a Groq key
- `AI_CHAT_ALLOWED_ORIGINS` — `http://localhost:5173,http://127.0.0.1:5173,https://testingdemo45.netlify.app,https://rococo-florentine-8dbe2c.netlify.app` (new FlowSuite origin added 2026-11-22; no function redeploy needed)

Secrets are referenced by name only in source. No provider key belongs in a
`VITE_*` variable. Random origins receive `403 {"error":{"code":"origin_not_allowed"}}`.

**Action required by the owner:** the Groq key was pasted into chat earlier and
must be rotated at the provider console. After rotation, set the new value as
the hosted `OPENAI_API_KEY` secret and redeploying `ai-chat` is NOT required
(secret changes are picked up by the runtime).

## Backup status

A schema-only dump via `supabase db dump --remote --schema public` was attempted
on 2026-11-22 and **failed** because Docker Desktop is not running on this
machine (`DockerRunError`). No backup file was produced.

Until Docker or `pg_dump` is available, take a backup from the Supabase
dashboard: **Project → Database → Backups**, or use the dashboard SQL editor.
Do not store a data dump containing real customer records inside the git repo.

## Git-connected production deploy (2026-11-22)

The Netlify project `rococo-florentine-8dbe2c` is linked to
`https://github.com/shashikumar21/FlowSuite.git`, branch `master`. The Git repo
is now the source of truth; manual static drops are deprecated.

- First Git production deploy: commit `2c5cfcd`, deploy
  `6b02dce9c6260b8b1b61746d`, built from `master`.
- Final verified deploy: `master@b1fe405` (deploy `6b02de07e7fe…`), built after
  the Netlify env vars were added. JS/CSS MIME types, immutable asset caching,
  SPA deep links and AI-chat CORS were all confirmed on this deploy.
- Build settings come from `netlify.toml`: `npm run build`, publish `dist`,
  Node `22`, SPA fallback and immutable `/assets/*` caching.
- Public values (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `VITE_APP_NAME`, `VITE_SUPPORT_EMAIL`) are set in Netlify site configuration
  (Keys and secrets), never committed. No service-role, database, AI or payment
  secret is exposed to the browser.
- Every push to `master` starts a new production build; re-deploy after changing
  Netlify env values because they are read at build time.

## Demo account and write-path validation (2026-11-22)

A separate demo user and tenant were created with explicit approval; the owner
login is never used for demos:

- `demo@flowsuite.app` / `FlowSuiteDemo@2026`
- user `ce68894b-0ae5-44d8-9d75-f1fa10bf2cba`
- tenant `09902c67-e585-427c-98be-df91c211e864` (`Demo Dental Clinic`)
- seeded: 5 contacts, 2 deals, 3 appointments, 3 conversations, 3 messages, 3 tasks

Validated with the demo login on the live Netlify site:

- Contacts: create, edit, assign, log activity and archive all persisted.
- Deals: create with value, move stage and change owner all persisted. Editing a
  deal value after creation is available in the deal detail dialog and writes
  only `deals.value` under the already-hosted `0004` UPDATE policy. Deleting a
  deal is deliberately not exposed in the client: destructive actions must go
  through a server-side RPC, and no such RPC is hosted yet.
- Appointments: status change persisted. Reschedule/assign are blocked by the
  absence of seeded bookable resources and availability rules, not by RLS.
- Inbox: mark-read, status change and internal note all persisted. No external
  email was sent. An internal note reopens a closed thread.
- Tasks: create, edit, delete and status actions still fail with missing
  `public.tasks_*` RPC errors, confirming `0022` is not hosted.
- Growth websites: **updated 2026-11-22** after explicit approval and hosted
  apply of `0021_growth_modules.sql` via `supabase db query --remote --yes`.
  Growth tables/RPCs now exist on hosted; `/app/growth*` pages load genuine
  empty states. A smoke create/delete of a website record succeeded and was
  cleaned up.
- Tenant isolation: demo-token reads of the original owner tenant returned zero
  rows across contacts, deals, appointments, conversations, tasks and
  businesses. Demo user has one active membership: owner of the demo tenant.

All write-test artifacts were deleted or restored; the demo tenant is back to
its seeded state. This login is safe to use for guided sales demos, but the
product is not ready to sell as a finished multi-tenant SaaS until the hosted
migrations/RPC promotion, RLS hardening, billing, custom domain, backups and
legal pages are in place.

## Safe fixes applied (2026-11-22)

These changed code/docs only; no hosted schema, RLS policy or destructive action
was touched:

- Route-level code splitting (`React.lazy` + `Suspense`) removed the Vite
  `>500 kB chunk` build warning. The initial JS bundle is now about 374 kB and
  each page loads on demand.
- Deal value can now be edited after creation. `updateDealValue` writes only
  `deals.value` through the already-hosted `0004` UPDATE policy, scoped by
  tenant and deal id, with Zod validation and an explicit error when no row is
  updated. Covered by `src/modules/crm/deal-value.test.ts`.
- Deal deletion was **not** added to the client. It is a destructive action and
  must be implemented as a server-side RPC before it is exposed.
- Booking reschedule/assign still needs seeded bookable resources and
  availability rules in the hosted database; that is a hosted write and remains
  approval-gated.

Still approval-gated: hosted promotion of `0019`–`0022`, RLS hardening, Groq key
rotation (provider console), deletion of the failed Netlify site and project
rename.

## Local-only work not present on hosted (do not assume it exists)

The following changes exist **only in the repository** as of 2026-11-22. They
have not been applied, deployed or promoted to `grkzontnyjnhijmphypo`:

- `supabase/migrations/0019_phase3_email_outreach.sql` — approvals table and
  nine Phase 3 RPCs. Read-only checks returned `404 PGRST202` for
  `sales_create_campaign` and `404` for `public.sales_email_approvals`, so it is
  definitely absent. `sales_dashboard_metrics` and `sales_is_suppressed` exist.
- `supabase/functions/sales-email-draft/index.ts` — source only, not deployed.
  `supabase functions list` still shows only `ai-chat` at version `9`.
- `supabase/migrations/0020_phase4_contacts_replies.sql` — nine Phase 4 RPCs for
  decision makers, manual verification, signals and replies. Never submitted to
  hosted.
- `supabase/migrations/0021_growth_modules.sql` — six new `growth_*` tables and
  18 trusted RPCs for Marketing, Campaigns, Websites and Reputation. **Applied to
  hosted 2026-11-22** with explicit user approval via
  `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0021_growth_modules.sql`.
  Verified: all 6 `growth_*` tables and 18 `growth_*` RPCs present.
- `supabase/migrations/0022_tasks_module.sql` — additive actor/completion
  columns, `SELECT`-only RLS replacing the broad `0001` tasks policy, and four
  trusted `tasks_*` RPCs. Never submitted to hosted. The hosted `tasks` table
  keeps its original `0001` shape and `FOR ALL` policy.
- `supabase/migrations/0023_voice_call_agent.sql` — provider-agnostic Voice /
  AI Call Agent foundation: `voice_agents`, `call_sessions`, `call_transcripts`,
  `call_events`, `call_handoffs` tables, SELECT-only RLS, and four trusted RPCs
  (`voice_upsert_agent`, `voice_log_call_session`, `voice_create_handoff`,
  `voice_resolve_handoff`). **Applied to hosted 2026-11-22** with explicit user
  approval via `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0023_voice_call_agent.sql`.
  Verified: all 5 voice/call tables and 4 `voice_*` RPCs present. No telephony
  provider, secrets, webhooks, or calling behavior is configured.
- `supabase/migrations/0024_payments_manual_invoices.sql` — manual invoice shell:
  `invoices` and `invoice_payments` tables, SELECT-only RLS, server-computed
  totals/status, and trusted RPCs (`payments_create_invoice`,
  `payments_update_invoice`, `payments_record_payment`,
  `payments_delete_invoice`). Never submitted to hosted. No payment provider,
  gateway, webhook, or online collection is configured.

Hosted therefore still has exactly 10 Sales Agent tables and 12
`sales_*`/`can_manage_sales_agent` RPCs, 6 Growth tables and 18 `growth_*` RPCs
(from `0021`, applied 2026-11-22), 5 Voice/Call Agent tables and 4 `voice_*` RPCs
(from `0023`, applied 2026-11-22), no `tasks_*` RPCs, and no invoice/payment
tables or RPCs. The Phase 3, Phase 4, Tasks, and manual Payments pages in this
repo run against the hosted project through `.env.local` and correctly show
schema-cache/missing-table errors until a deliberate promotion is approved.

## Read-only verification commands

```powershell
cd "C:\Users\mshas\Downloads\os app for ai\ai-business-os"
supabase link --project-ref grkzontnyjnhijmphypo
supabase functions list --output-format json
supabase db query --remote --read-only "select count(*) from pg_tables where schemaname='public' and rowsecurity;" --output-format json
```

These commands do not write to the hosted database and do not deploy anything.

## Local development note

This machine has no local Supabase: Docker Desktop is not running, `psql` is not
on PATH, and port 54322 is closed. The Vite dev server at `localhost:5173` uses
the hosted project via `.env.local`, so local UI work still runs against real
Supabase data. `supabase/tests/ai_sales_agent.sql` therefore remains unexecuted
and is tracked as an outstanding task.
