# AI Sales Agent (native module) — Phase 2 foundation

This is a **new, native module** at `src/modules/sales-agent/`. It is deliberately separate from the website/WhatsApp assistant in `src/modules/ai-console/` and from CRM contacts. Migrations `0014`–`0016` are not modified.

## Status

| Capability | State |
| --- | --- |
| Overview with real tenant counts | Working (`0017` applied locally and on hosted) |
| Manual saved searches (criteria only) | Working (`0017` applied) |
| Prospect add/edit/delete/status/import | Working (`0017` applied) |
| Server-side duplicate prevention | Working (`0017` applied) |
| Prospect → CRM contact conversion | Working (`0018` applied; idempotent, duplicate-safe, audited) |
| Business discovery provider | **Unavailable** — no provider configured |
| Contact verification provider / manual attestation UI | **Unavailable** — schema only |
| AI email drafting, campaigns, approvals, outbox, replies | **Unavailable** — schema only, nothing can send |

All dashboard values are `count(*)` over real tables via `public.sales_dashboard_metrics`. Empty tables produce genuine zeros; no lead scores or demo data are generated.

No paid prospecting, verification or email APIs are connected. The separate website chat (`ai-chat` Edge Function) is deployed and configured with a free Groq provider, but that is independent of Sales Agent discovery/verification/email features.

## Apply the migrations

Local:

```bash
cd ai-business-os
npx supabase db reset --local   # applies 0001..0018 plus supabase/seed.sql
psql "$DATABASE_URL" -f supabase/tests/ai_sales_agent.sql   # optional, rolls back
```

Hosted project (`grkzontnyjnhijmphypo`) — applied in order with an explicit decision, via `supabase db query --remote` (the hosted migration history table was empty, so `db push` was intentionally avoided):

1. `0015` – prerequisite fixes
2. `0016` – prerequisite fixes
3. `0017_ai_sales_agent.sql` – Sales Agent schema (the hosted variant of two statements was fixed first; see commit `ccddd6c`)
4. `0018_sales_prospect_contact_conversion.sql` – prospect → CRM contact conversion, plus a forward-only correction of a misordered `prospects.converted_contact_id` foreign key from `0017` (it referenced `contacts(id, tenant_id)` instead of `contacts(tenant_id, id)`, so any conversion would have failed)

Verified on hosted: 10 Sales Agent tables, 12 `sales_*`/`can_manage_sales_agent` functions, RLS enabled, and the ACLs below. A rolled-back end-to-end smoke test against the live database passed all five assertions: reuses an existing email-matched contact, creates a new contact, is idempotent, writes 2 audit entries, and denies a non-member caller. No test data persisted (0 prospects, 0 smoke contacts, 0 audit rows afterwards). The full SQL regression file `supabase/tests/ai_sales_agent.sql` has not been executed locally (no local Postgres/psql is available).

## Routes and navigation

- `/app/sales-agent` — Overview
- `/app/sales-agent/discovery` — Prospect discovery (manual saved searches)
- `/app/sales-agent/prospects` — Prospects (with **Convert** action)

Sidebar group: **AI Sales Agent NEW**. Decision makers, AI email writer, Campaigns, Approvals and Replies are shown as planned (`/app/module/...`) and are not functional.

## Security model

- Every table has RLS `FOR SELECT TO authenticated USING (public.has_tenant_access(tenant_id))`. Browser code has **SELECT only**; there are no client `INSERT`/`UPDATE`/`DELETE` grants.
- All writes go through `SECURITY DEFINER` RPCs with `set search_path = ''`, fully qualified `public.*` names, and a membership check **before** any row is touched.
- New functions explicitly `REVOKE ... FROM public, anon` (Supabase grants `anon` EXECUTE by default) and `GRANT EXECUTE ... TO authenticated`. Verified hosted ACLs: `anon_rpc_exec:false`, `anon_table_select:false`, `auth_rpc_exec:true`, `auth_table_select:true`, `auth_table_insert:false`.
- Destructive actions (delete prospect) additionally require `public.can_manage_sales_agent(p_tenant)` — owner/admin of an active membership. Client roles are UX only, mirrored in `src/lib/permissions.ts`.
- Tenant-scoped unique partial indexes prevent duplicate prospects by email, normalized website and business name + city + country. The `sales_find_duplicate_prospect` RPC is a friendly pre-check; the indexes are authoritative.
- `public.sales_is_suppressed(p_tenant, p_email)` is the server-authoritative suppression lookup. Phase 3 sending must call it (or re-check the table) and must never trust a client flag.
- State changes are appended to the existing immutable `public.audit_logs` table (`sales.prospect_created`, `sales.prospect_updated`, `sales.prospect_deleted`, `sales.prospect_lead_status_changed`, `sales.search_saved`, `sales.prospects_imported`, `sales.prospect_converted_to_contact`).
- A syntactically valid email is **never** marked verified. `contact_verifications` has a CHECK constraint requiring a provider reference or a human attestor for `status = 'verified'`, and no client can insert into it.
- No secrets are read by the browser. Provider keys, when added, must live in server-side Supabase secrets / Edge Functions and be referenced by name only. Never add them as `VITE_*`.

## CRM conversion (`0018`)

`public.sales_convert_prospect_to_contact(p_tenant, p_prospect)` converts a prospect into a real CRM contact:

- Checks `has_tenant_access(p_tenant)` first and locks the prospect row (`FOR UPDATE`) before any write.
- Delegates new contact creation to the existing `public.create_contact` RPC, so CRM validation, assignment rules, the `lead_created` activity and `contact.created` audit entry stay in one place. The source is set to `sales_agent` and the prospect's company, notes, city, email, phone and assigned owner are carried over.
- Reuses an existing CRM contact when the tenant already has one with the same email (case-insensitive) and appends a `Linked from Sales Agent prospect` activity instead of creating a duplicate.
- Idempotent: re-running on an already-converted prospect returns the same linked `contact_id` and creates nothing new. A prospect whose linked contact was deleted can be converted again.
- Sets the prospect's `lead_status = 'converted'`, `converted_at` and `converted_contact_id`, and appends a `sales.prospect_converted_to_contact` audit entry.
- UI: a **Convert** action on each unconverted prospect; converted rows show an **In CRM** badge. Client roles never gate the write — the RPC is authoritative.

## Files

Created: `supabase/migrations/0017_ai_sales_agent.sql`, `supabase/migrations/0018_sales_prospect_contact_conversion.sql`, `supabase/tests/ai_sales_agent.sql`, `src/modules/sales-agent/{schemas,types,utils,api,hooks,schemas.test,utils.test}.ts*`, `src/modules/sales-agent/components/{StatusBadges,ProviderStatus,ProspectFormModal,SavedSearchFormModal}.tsx`, `src/modules/sales-agent/pages/{SalesAgentOverviewPage,ProspectDiscoveryPage,ProspectsPage}.tsx`, this file.

Modified: `src/types/database.ts`, `src/lib/permissions.ts`, `src/app/config/navigation.ts`, `src/app/layouts/AppLayout.tsx`, `src/app/router/index.tsx`, `README.md`.

## Exact next steps

1. Execute `supabase/tests/ai_sales_agent.sql` against a local Postgres to cover the conversion, idempotency and cross-tenant cases (no local DB was available during this phase).
2. Verify Supabase auth redirects include the production origin before hosting.
3. Add provider abstractions (server-only) for discovery and verification; keep features failing closed until credentials exist.
4. Phase 3: AI email writer, campaign manager and approval inbox with manual approval as the default and server-side suppression checks.
5. Phase 4: reply handling and decision-maker research (CRM conversion is already implemented via `create_contact`).
