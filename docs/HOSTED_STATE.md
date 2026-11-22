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
- `AI_CHAT_ALLOWED_ORIGINS` — `http://localhost:5173,http://127.0.0.1:5173,https://testingdemo45.netlify.app`

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

Hosted therefore still has exactly 10 Sales Agent tables and 12
`sales_*`/`can_manage_sales_agent` RPCs. The Phase 3 and Phase 4 pages in this
repo run against the hosted project through `.env.local` and correctly show
schema-cache errors until a deliberate promotion is approved.

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
