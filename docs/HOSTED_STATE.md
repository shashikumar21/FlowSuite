# Hosted Supabase state — do not duplicate or overwrite

This file records the **current hosted state** so future work does not re-apply
migrations or re-deploy functions that already exist. Treat it as a snapshot;
verify with the read-only commands below before changing anything.

Snapshot taken: 2026-11-22.

Deployment note 2026-11-24: commit `3ace64f` added the FlowSuite appointment
calendar and finalised the Google Calendar OAuth runtime. The Netlify
auto-deploy for `rococo-florentine-8dbe2c` was still showing the previous
bundle, so a follow-up documentation-only commit is used to retrigger it.

Applied 2026-11-24: `0043_patient_medical_history.sql` adds a `doctor` tenant
role, append-only consented medical-history entries, RPC-only access and
metadata-only audits. It was smoke-tested in a rolled-back transaction, then
applied to hosted Supabase with explicit approval. Verified: table, RLS, audit
trigger, role checks, RPCs and grants are present; zero patient rows. The
privacy policy was updated to describe sensitive health data. **Do not
re-apply.**

Applied 2026-11-24: `0045_patient_documents_storage.sql` adds a private
`patient-documents` Storage bucket, service-role-only authorization/audit
helpers, and metadata-only audit logs. It was smoke-tested in a rolled-back
transaction, then applied to hosted Supabase with explicit approval. Verified:
bucket is private with a 10 MB limit and four allowed MIME types; helpers are
executable only by `service_role`; no `storage.objects` policies exist because
the CLI role is not the table owner; zero patient-document audit rows. **Do not
re-apply.** The `patient-documents` signer function was deployed to hosted
2026-11-24 with explicit approval (`ACTIVE`, v1, `verify_jwt=true`). A controlled
demo-tenant test exercised sign-upload → upload → list → signed open → delete
through the local UI with a clearly labelled dummy file; the file was removed,
cross-tenant access returned HTTP 403, and 16 metadata-only audit rows were
written across all controlled tests. Final hosted check: 0 objects in the
bucket. The scanner UI is deployed to Vercel (see below).

## Project

| Field | Value |
| --- | --- |
| Project ref | `grkzontnyjnhijmphypo` |
| Project name | `FlowSuite` |
| URL | `https://grkzontnyjnhijmphypo.supabase.co` |
| Primary tenant | `06a77082-53a2-4e9c-9c35-3214a76c9ba6` (Abhishek Dental Care and Poly Clinic) |
| Demo tenant | `09902c67-e585-427c-98be-df91c211e864` (`Demo Dental Clinic`), demo user `ce68894b-0ae5-44d8-9d75-f1fa10bf2cba` |
| Catalog inventory | 64 public tables at the 2026-11-22 snapshot, all with RLS enabled; 115 `SECURITY DEFINER` functions; 12 `sales_*`/`can_manage_sales_agent` RPCs. `0043` added one RLS-enabled table on 2026-11-24. |

## Migrations already applied to hosted

The hosted migration-history table was empty, so `supabase db push` was
deliberately never used. Migrations were applied manually through the CLI SQL
query endpoint / dashboard. **Do not re-apply any of these.**

- `0001_core_foundation.sql` → `0013_crm_lead_enrichment.sql`
- `0015_milestone4_ai_service_rpcs.sql`
- `0016_milestone4_ai_qualification_rpcs.sql`
- `0017_ai_sales_agent.sql` — hosted variant of two statements was corrected first (commit `ccddd6c`)
- `0018_sales_prospect_contact_conversion.sql` — conversion RPC plus a forward-only fix for the misordered `prospects.converted_contact_id` foreign key from `0017` (commit `1e3ff75`)
- `0043_patient_medical_history.sql` — applied 2026-11-24 after a rollback smoke test; adds the `doctor` role and consented medical-history table/RPCs. **Do not re-apply.**

`0014_milestone4_ai_communication.sql` exists in the repo and is part of the
migration sequence; verify before assuming it is absent from hosted. No
migration may be edited retroactively — corrections go in a new numbered file.

Verified hosted ACLs after `0018`: `anon_rpc_exec:false`,
`anon_table_select:false`, `auth_rpc_exec:true`, `auth_table_select:true`,
`auth_table_insert:false`. `sales_convert_prospect_to_contact` is
`SECURITY DEFINER`, returns `uuid`, and is executable only by `authenticated`.

## Edge Functions already deployed

Verified read-only via `supabase functions list --project-ref grkzontnyjnhijmphypo --output-format json` on 2026-11-23:

| Slug | Status | Version | verify_jwt | import_map | Source hash (sha256) |
| --- | --- | --- | --- | --- | --- |
| `ai-chat` | `ACTIVE` | `11` | `false` | `true` | `d3b5528f210603b1a378d057e6855718b19193441630a7328e44c0101e19df35` |
| `website-generate` | `ACTIVE` | `3` | `true` | `true` | `f7bed983a2a39fdb55d2073542a17bb72a53acc433ce880f9a321e40a848b674` |
| `calendar-oauth-start` | `ACTIVE` | `7` | `true` | `true` | `c34fc431a7e6c6fa9d4088ed556ce09756e848bdebb06c72eab5fe036c0ceeba` |
| `calendar-oauth-callback` | `ACTIVE` | `6` | `false` | `true` | `1fb133a9e0848f140370cefab2ff603ab2d3aed5b884ecc6f30ef8d7584bd908` |
| `review-suggest` | `ACTIVE` | `3` | `false` | `true` | `0068222d600b79e76b7fd0ae6c72c316f1122792450aeda35e15e8e706e6515f` |
| `integrations-vault-save` | `ACTIVE` | `3` | `true` | `true` | `2239aa34b5c3197936218af8cd65d1bd105803a2cad07ca01b61ec703fe3d38b` |
| `calendar-sync-appointment` | `ACTIVE` | `3` | `false` | `true` | `04fde743224913dabb72a210657afe63c44f1f34ac0dfb9a968b2557fd2cc1be` |
| `review-request-send-whatsapp` | `ACTIVE` | `3` | `true` | `true` | `7c9a20c309b630ed1efdcac85b41c264ee47668795869ada044cb69f8fb24242` |
| `patient-documents` | `ACTIVE` | `1` | `true` | `true` | `3783a83fa32f60bc30b762ff1ee4d00ccad9cba7542f2d81df0f4e55836ce77c` |

**Do not re-deploy deployed functions without explicit approval.** Compare hashes
with `supabase functions list` before considering any future change. Other
function folders in the repo (`whatsapp-webhook`, `whatsapp-send`,
`ai-follow-up-worker`, `telephony-webhook`) are **not** deployed. No scheduler
is configured.

## Server-side secrets (names only — never values)

- `AI_PROVIDER=openai` (selects the OpenAI-compatible adapter)
- `OPENAI_BASE_URL` — currently the Groq OpenAI-compatible endpoint
- `OPENAI_MODEL` — currently `openai/gpt-oss-120b`
- `OPENAI_API_KEY` — currently a Groq key
- `AI_CHAT_ALLOWED_ORIGINS` — localhost plus the three Vercel origins listed
  below. Netlify origins were removed on 2026-11-24 with explicit approval; no
  `ai-chat` function redeploy was needed.
- `CREDENTIALS_ENCRYPTION_KEY` — required by `integrations-vault-save` and
  `review-request-send-whatsapp` for server-side vault encryption/decryption.
  **Set on hosted 2026-11-23** with explicit user approval; a random 32-byte
  base64 key was generated locally and passed directly to Supabase without being
  displayed in chat or stored in the repo.
- Tenant vault secret names (stored encrypted in `integration_secrets`, provider
  `whatsapp`, never in client code/chat): `WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_PHONE_NUMBER_ID`.

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

## Vercel production deploy (2026-11-24)

The frontend was moved to Vercel with explicit approval. The GitHub repo
`shashikumar21/FlowSuite`, branch `master`, is the source of truth.

- Project: `shashi-a0fc/flow-suite`, root directory `./` (the git repo root is
  the Vite app), framework preset Vite, build `npm run build`, output `dist`.
- Primary URL: `https://flow-suite-two.vercel.app`
  (aliases: `https://flow-suite-shashi-a0fc.vercel.app` and
  `https://flow-suite-git-master-shashi-a0fc.vercel.app`).
- Deployed commit `1df78c1` (`Add Vercel SPA rewrite`), built from the scanner
  commit `6be9e6e`. Status: `Ready`.
- `vercel.json` adds an SPA fallback rewrite to `index.html`, so deep links such
  as `/privacy`, `/terms`, `/app/booking/calendar` and
  `/book/demo-dental-clinic` render correctly instead of returning Vercel 404.
- Production-only env vars set in Vercel (browser-safe values taken from local
  `.env.local`, never printed or committed): `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY`. No service-role or provider secret is in
  Vercel. Rebuild after changing them because Vite bakes them into the bundle.
- Verified live: no “Connect your Supabase project” screen; login page, privacy
  and terms pages, booking calendar route, and public booking page with
  Asia/Kolkata slots all render. The deployed `ContactsPage` chunk contains the
  Patient files scanner strings.
- Supabase Auth redirect URLs now contain only localhost and the three Vercel
  origins with `/**`; the old Netlify redirect was removed. The Site URL was
  changed to `https://flow-suite-two.vercel.app/` on 2026-11-24 with explicit
  approval.
- `AI_CHAT_ALLOWED_ORIGINS` now contains only localhost and the three Vercel
  origins; all Netlify origins were removed. No `ai-chat` function redeploy was
  needed.
- The older Netlify sites are retired from the auth/CORS configuration. The
  sites themselves still exist in Netlify: `flowsuite-tbyz` has scanner code but
  no Supabase env vars; `rococo-florentine-8dbe2c` has env vars but a stale
  pre-scanner bundle. They should not be used.

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
- Appointments: status change persisted. Reschedule/assign were originally
  blocked by the absence of seeded availability rules, not by RLS.
  **Update 2026-11-24:** with explicit user approval, Mon–Sat 09:00–18:00
  Asia/Kolkata weekly rules were added to the demo tenant through
  `booking_upsert_availability_rule`; `booking_compute_slots` now returns 35
  slots per tested date and the public booking page shows them.
- Inbox: mark-read, status change and internal note all persisted. No external
  email was sent. An internal note reopens a closed thread.
- Tasks: create, edit, delete and status actions still fail with missing
  `public.tasks_*` RPC errors, confirming `0022` was not hosted at smoke-test time. **Update 2026-11-23:** `0022` applied with explicit approval.
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
- Booking reschedule/assign now has seeded bookable resource and weekly
  availability rules in the hosted demo tenant (approved hosted write on
  2026-11-24). No further hosted data write is needed for slot preview.

Still approval-gated: RLS hardening, Groq key
rotation (provider console), deletion of the failed Netlify site and project
rename.

## Local-only work not present on hosted (do not assume it exists)

The following changes exist **only in the repository** as of 2026-11-22. They
have not been applied, deployed or promoted to `grkzontnyjnhijmphypo`:

- `supabase/migrations/0019_phase3_email_outreach.sql` — approvals table and
  nine Phase 3 RPCs. **Applied to hosted 2026-11-23** with explicit user approval
  via `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0019_phase3_email_outreach.sql`.
- `supabase/functions/sales-email-draft/index.ts` — source only, not deployed.
  No provider configured; nothing sends.
- `supabase/migrations/0020_phase4_contacts_replies.sql` — nine Phase 4 RPCs for
  decision makers, manual verification, signals and replies. **Applied to hosted
  2026-11-23** with explicit user approval via
  `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0020_phase4_contacts_replies.sql`.
- `supabase/migrations/0021_growth_modules.sql` — six new `growth_*` tables and
  18 trusted RPCs for Marketing, Campaigns, Websites and Reputation. **Applied to
  hosted 2026-11-22** with explicit user approval via
  `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0021_growth_modules.sql`.
  Verified: all 6 `growth_*` tables and 18 `growth_*` RPCs present.
- `supabase/migrations/0022_tasks_module.sql` — additive actor/completion
  columns, `SELECT`-only RLS replacing the broad `0001` tasks policy, and four
  trusted `tasks_*` RPCs. **Applied to hosted 2026-11-23** with explicit user
  approval via
  `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0022_tasks_module.sql`.
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
  `payments_delete_invoice`). **Applied to hosted 2026-11-22** with explicit user
  approval via `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0024_payments_manual_invoices.sql`.
  Verified: 2 tables and 6 `payments_*` RPCs present. No payment provider,
  gateway, webhook, or online collection is configured.
- `supabase/migrations/0025_calendar_google_connection.sql` — Google Calendar
  Phase 1 connection (one calendar per business, FlowSuite -> Google direction
  planned; Phase 1 connect/disconnect/status only): `calendar_connections` table,
  token isolation (no authenticated token exposure), and trusted RPCs
  (`calendar_connection_status`, `calendar_connection_disconnect`). **Applied to
  hosted 2026-11-22** with explicit user approval via
  `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0025_calendar_google_connection.sql`.
  No Google OAuth secrets configured by this step; no calendar sync/webhooks
  enabled; Edge Functions not deployed yet.
- `supabase/migrations/0027_workflows.sql` — Workflows v1 definitions shell
  (no execution engine): `workflows` table, SELECT-only RLS, and trusted RPCs
  (`workflows_create`, `workflows_update`, `workflows_set_status`,
  `workflows_delete`). **Applied to hosted 2026-11-22** with explicit user
  approval via
  `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0027_workflows.sql`.
  No workflow execution/webhooks/external actions enabled.
- `supabase/migrations/0028_workflows_phase_a.sql` — Workflows Phase A run logs:
  `workflow_runs` and `workflow_run_steps` tables, SELECT-only RLS. **Applied to
  hosted 2026-11-22** with explicit user approval via
  `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0028_workflows_phase_a.sql`.
  No runner/execution enabled.
- `supabase/migrations/0029_workflows_review_requests.sql` — adds
  `appointment_completed` workflow trigger support and `review_requests` outbox
  table (`pending_approval` default; no auto-send). **Applied to hosted 2026-11-22**
  with explicit user approval via
  `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0029_workflows_review_requests.sql`.
  No WhatsApp/provider sending enabled.
- `supabase/migrations/0026_calendar_google_sync.sql` — Google Calendar Phase 2
  appointment sync mapping/RPC groundwork. **Applied to hosted 2026-11-23** with
  explicit user approval via
  `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0026_calendar_google_sync.sql`.
  `calendar-sync-appointment` Edge Function **deployed** (v1, verify_jwt false) with explicit approval.
- `supabase/migrations/0030_review_suggestion_mvp.sql` — tokenized public review
  link, feedback capture, and AI suggestion status fields/RPCs. **Applied to
  hosted 2026-11-23** with explicit user approval via
  `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0030_review_suggestion_mvp.sql`.
  `review-suggest` Edge Function **deployed** (v1, verify_jwt false) with explicit approval.
- `supabase/migrations/0031_deploy_provider_credentials.sql` — extends
  `channel_credentials` provider support for Netlify/Vercel deploy secret
  reference names (no raw tokens). **Applied to hosted 2026-11-23** with explicit
  user approval via
  `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0031_deploy_provider_credentials.sql`.
- `supabase/migrations/0032_workflows_review_request_runner.sql` — review-request
  runner MVP: DB trigger creates `pending_approval` review requests on
  appointment completion for active `appointment_completed` workflows; adds
  `review_request_set_status` RPC for approve/cancel. **Applied to hosted 2026-11-23**
  with explicit user approval via
  `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0032_workflows_review_request_runner.sql`.
  No external messages are sent.
- `supabase/migrations/0033_integration_secret_vault.sql` — secure encrypted
  integration secret vault (metadata RPC + disconnect RPC, ciphertext stored
  server-side; plaintext encrypted in Edge Function). **Applied to hosted 2026-11-23**
  with explicit user approval via
  `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0033_integration_secret_vault.sql`.
  `integrations-vault-save` Edge Function **deployed** (v1, verify_jwt true) with explicit approval.
- `supabase/migrations/0034_crm_delete_deal.sql` — server-side `crm_delete_deal`
  RPC (manager+ only, audited). **Applied to hosted 2026-11-23** with explicit
  user approval via
  `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0034_crm_delete_deal.sql`.
- `supabase/migrations/0035_fix_workflows_review_request_runner.sql` — fixes
  `workflows_handle_appointment_completed()` to avoid unassigned `v_contact`
  record access when appointment has no linked contact. **Applied to hosted
  2026-11-23** with explicit user approval via
  `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0035_fix_workflows_review_request_runner.sql`.
- `supabase/migrations/0036_fix_workflows_trigger_types.sql` — fixes
  `workflows_create`/`workflows_update` RPC validation to allow
  `appointment_completed` trigger type (table constraint already allowed it). **Applied to hosted 2026-11-23** with explicit user approval via
  `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0036_fix_workflows_trigger_types.sql`.
- Approval-gated WhatsApp review-request send MVP: code committed/pushed as
  `63c4175`; `review-request-send-whatsapp` Edge Function **deployed to hosted
  2026-11-23** (v1, verify_jwt true, import_map true) with explicit user approval
  via `supabase functions deploy review-request-send-whatsapp --project-ref grkzontnyjnhijmphypo --yes`.
  Verified via `supabase functions list`. The function only sends manually after
  a request is `approved`; no auto-send/dispatch/scheduler is enabled. No live
  WhatsApp send was performed; provider secrets, customer opt-in, and an approved
  Meta template are still required for production sends. `CREDENTIALS_ENCRYPTION_KEY`
  was set on hosted 2026-11-23 with explicit approval so vault saves can work.
- Meta template support for review sends: code committed/pushed as `823c3d2`;
  `review-request-send-whatsapp` **re-deployed to hosted 2026-11-23** (v3,
  verify_jwt true, import_map true, hash `7c9a20c309b630ed1efdcac85b41c264ee47668795869ada044cb69f8fb24242`)
  with explicit user approval via the same `supabase functions deploy ... --yes`
  command. The function now requires a tenant `message_templates` row with key
  `review_request`, `status='approved'` and a Meta template name, plus a recorded
  WhatsApp `opt_in` for the contact; opt-out/revoked always blocks. Still no
  auto-send. Also added `npm run typecheck:functions` and fixed pre-existing Deno
  type errors in `_shared/vault.ts`, `calendar-oauth-callback`, and
  `sales-email-draft` (no runtime behavior change). No live WhatsApp send was
  performed during this deploy.
- Demo-tenant WhatsApp send prerequisites seeded 2026-11-23 with explicit user
  approval, scoped strictly to tenant `09902c67-e585-427c-98be-df91c211e864`:
  one `message_templates` row (`template_key='review_request'`, provider
  `whatsapp`, `provider_template_name='review_request_v1'`, language `en`, local
  status `approved`) and one `communication_consents` row (`channel='whatsapp'`,
  `status='opt_in'`, `source='manual'`) for demo contact
  `d0000000-0000-4000-8000-000000000010`. An audit log was written. The pending
  review request was deliberately **not** approved and no message was sent, so
  the human approval gate remains intact. `review_request_v1` is a placeholder
  name — it must match the actual Meta-approved template name before a live send
  can succeed.
- Painter - 4 workflow link fix 2026-11-23 with explicit user approval, scoped to
  workflow `c8518411-ae2a-4134-9701-184bbce5a9a2` in the demo tenant: the action
  config was changed from `review_link_type='google'` with a hardcoded
  `g.page` URL to `review_link_type='flowsuite'` with empty `review_url`, and the
  action label updated to "Request review via FlowSuite link (approval
  required)". An audit log `demo.workflow_review_link_changed` was written. The
  workflow remains `active` with `trigger_type='appointment_completed'`; future
  generated requests will use the FlowSuite review page. The existing Anita
  Sharma request `7402cc31-4f47-4f90-aa0a-8fcb8d599b98` was NOT modified — it
  remains `failed` from a manual send attempt at 15:54 UTC (approved_by actor
  `ce68894b-0ae5-44d8-9d75-f1fa10bf2cba`, Meta rejected the placeholder
  template). No message was delivered, and no new send was triggered. Also
  confirmed there is no `cron` schema and no dispatcher/scheduler in the
  codebase — the only workflow runner is
  `workflows_handle_appointment_completed()`, so Painter templates 1/2/3/5
  remain non-executing drafts by design and were left as drafts.
 - `supabase/migrations/0037_billing_razorpay.sql` — additive Razorpay billing
   foundation: `billing_orders` + `billing_webhook_events` tables, tenant-scoped
   `billing_get_overview` / `billing_check_entitlement` / `billing_check_limit`
   RPCs, and service-role-only order/activation/webhook RPCs. **Applied to hosted
   2026-11-23** with explicit user approval via
   `supabase db query --remote=grkzontnyjnhijmphypo --yes -f supabase/migrations/0037_billing_razorpay.sql`.
   Verified 8 `billing_*` functions and 2 `billing_*` tables exist. The migration
   changed no existing rows and enabled no hard feature blocking. The demo tenant
   still has no paid subscription, so entitlements are advisory only.
 - Razorpay Edge Functions **deployed to hosted 2026-11-23** with explicit user
   approval: `razorpay-create-order` (v1), `razorpay-verify-payment` (v1) and
   `razorpay-webhook` (v2, redeployed with `--no-verify-jwt` because Razorpay sends
   no JWT). All ACTIVE, import_map true. No Razorpay keys or webhook secret have
   been set on hosted, so the functions fail closed: the webhook returns HTTP 503
   `billing_not_configured`, and clicking a paid plan in Settings → Subscription
   shows "Razorpay is not configured on the server yet". No payment order was
   created, no payment was taken, and no subscription was activated. The browser
   verified the Subscription page loads all four seeded plans from the live RPC.
   Required hosted secrets still to be set by the user (never in chat):
   `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
   Razorpay webhook URL to configure:
   `https://grkzontnyjnhijmphypo.supabase.co/functions/v1/razorpay-webhook`.

  - **Applied to hosted 2026-11-23** with explicit user approval via
    `supabase db query --remote --yes -f <migration>`:
    - `supabase/migrations/0038_billing_admin_gating.sql` — super-admin manual
      plan assignment and enforcement switch, usage/settings RPCs and
      switch-controlled database limit triggers. Verified `billing_settings`
      exists, all six new RPCs exist, and `enforce_limits = false`. The first
      owner and pending invitations remain exempt from the member limit trigger
      so signup cannot be blocked. No plans or subscriptions were changed.
    - `supabase/migrations/0039_review_request_audit.sql` — manager+ approval
      check plus audit rows for every review-request approval/cancellation.
      Verified the hosted `review_request_set_status` definition now writes
      `review_request.approved` audit rows.
    - `supabase/migrations/0040_workflows_local_runners.sql` — local runners for
      Painter 1/2/3/5. They create tasks, in-app notifications, run/step logs and
      audit entries only. Provider steps are explicitly skipped, and
      `send_review_request` remains exclusive to the Painter 4 runner. Manual
      runs require manager+; one source event produces at most one run per
      workflow. Verified four runner functions, two triggers, the dedupe index
      and the widened notification type check. A rolled-back hosted smoke test
      created a temporary lead/workflow, confirmed one run, one local task, one
      skipped provider step and zero review requests, then rolled back; follow-up
      read-only checks found zero smoke rows and zero workflow runs.
    - `supabase/migrations/0041_review_rating_internal_followup.sql` — applied to
      hosted 2026-11-23 with explicit user approval. Submitting feedback now
      creates one internal task, in-app notices for owners/admins/managers and
      an audit row with `auto_send = false`. Verified the hosted function
      definition, then ran a rolled-back smoke test: exactly one task, at least
      one in-app notice, one audit row and zero messages; resubmission created no
      duplicate task. Follow-up read-only checks found zero smoke rows.
    - `supabase/migrations/0042_provider_connection_runtime.sql` — applied to
      hosted 2026-11-23 with explicit user approval. Verified the OAuth state
      table with RLS, two metadata-only audit triggers, and the single-use
      consume function. A rolled-back hosted smoke test confirmed status reads,
      state issue/consume (second consume returned false), metadata-only
      vault/calendar audit rows with no token/ciphertext keys, and zero
      messages. Follow-up read-only checks found zero smoke rows. With explicit
      approval, `calendar-oauth-start` v4 and `calendar-oauth-callback` v3 were
      then deployed to use this table; the callback now runs with
      `verify_jwt=false` and no longer uses HMAC state.
    - `calendar-oauth-start` and `calendar-oauth-callback` — deployed with
      explicit user approval after `0042`. `supabase functions list` confirms
      both `ACTIVE`, `import_map=true`, start `verify_jwt=true`, callback
      `verify_jwt=false`; source hashes are unchanged from the v4/v3 deploy
      (setting secrets later bumped the platform version numbers to 7/6). After
      the user set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and
      `GOOGLE_REDIRECT_URI` server-side, a no-auth callback GET returned 302
      with `calendar_error=missing_params`, and a fake state returned
      `calendar_error=invalid_state` (was `not_configured` before). No provider
      was contacted and no token or message was created.
  - **Local-only follow-up (NOT deployed/pushed):**
    - `src/modules/legal/` — public Privacy, Terms and Refund & Cancellation
      pages at `/privacy`, `/terms`, `/refund`, linked from sign-in and the app
      profile menu. Frontend-only, pending the user's deploy decision.
    - `supabase/functions/review-request-send-whatsapp/index.ts` now writes
      success/failure/blocked audit rows via the service role, with the acting
      user id preserved. This code is local only; the hosted v3 function is
      unchanged.
    - `supabase/tests/billing_and_review_rls.sql` — local-only SQL security tests
      for the 0037-0039 objects. Requires a local database with those migrations
      applied; Docker was unavailable, so it has not been executed.
    - `supabase/tests/workflows_local_runners.sql` — local-only SQL behavior and
      tenant-isolation tests for 0040; not executed as a local SQL file (no local
      database). The equivalent hosted smoke test above passed and was rolled
      back.
    - `src/modules/ai-console/local/` — local provider-connection dry run. It is
      off until enabled in Settings → Integrations, accepts secret names only,
      keeps simulated rows in sessionStorage, and calls no provider, Edge
      Function or Supabase RPC. It cannot send messages or create real
      connections.
    - Provider runtime frontend hardening — vault metadata and calendar
      status/OAuth-start responses are Zod-validated, vault metadata errors are
      shown explicitly, and the email secret name is consistently
      `EMAIL_PROVIDER_API_KEY`. Frontend-only and uncommitted.

Hosted therefore still has 11 Sales Agent tables and 30
`sales_*`/`can_manage_sales_agent` RPCs (from `0018`-`0020`, `0020` applied 2026-11-23), 6 Growth tables and 18 `growth_*` RPCs
(from `0021`, applied 2026-11-22), 5 Voice/Call Agent tables and 4 `voice_*` RPCs
(from `0023`, applied 2026-11-22), 2 invoice/payment tables and 6 `payments_*`
RPCs (from `0024`, applied 2026-11-22), 1 calendar connection table and 2
`calendar_*` RPCs (from `0025`, applied 2026-11-22), plus Phase 2 sync mapping/RPC groundwork (from `0026`, applied 2026-11-23; `calendar-sync-appointment` deployed; `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` are now set server-side by the user, and the callback smoke check moved from `not_configured` to `missing_params`),
4 workflow/review tables (`workflows`, `workflow_runs`, `workflow_run_steps`, `review_requests`) and 4 `workflows_*` RPCs plus review token/runner/approval RPCs (from `0027`-`0030`,`0032`, applied 2026-11-22/23; runner creates pending-approval records only; approval-gated WhatsApp send function deployed but no auto-send/dispatch/scheduler), and 1 `integration_secrets` vault table + 2 `integrations_*` RPCs (from `0033`, applied 2026-11-23; ciphertext only, `integrations-vault-save` deployed), and 1 `crm_delete_deal` RPC (from `0034`, applied 2026-11-23),
and 4 `tasks_*` RPCs (from `0022`, applied 2026-11-23), plus 2 billing tables and 8 `billing_*` RPCs (from `0037`, applied 2026-11-23; entitlements advisory only, no keys set, three functions deployed but inert), 0038 admin billing gating (six RPCs, default enforcement off), 0039 review-request approval audit, and 0040 local workflow runners (four functions, two triggers, dedupe index), and 0041 public-rating internal follow-up (task/notice/audit only, no external send), and 0042 provider connection runtime (status/audit/OAuth state; no deployed function uses it yet). Phase 3/4 DB/RPCs are applied; `sales-email-draft` remains undeployed and no provider is configured, so nothing sends.

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

## Local only — patient emails (2026-11-24)

- `supabase/migrations/0044_patient_email_outbox.sql` — **not applied to hosted.**
- `patient-email-dispatch` Edge Function — **not deployed**; no cron job created.
- Required secrets (names only, none set): `EMAIL_PROVIDER`, `EMAIL_PROVIDER_API_KEY`,
  `EMAIL_FROM_ADDRESS`, `PATIENT_EMAIL_CRON_SECRET`, `APP_PUBLIC_URL`.
- See [PATIENT_EMAILS.md](PATIENT_EMAILS.md) for the approval-gated go-live steps.
