# AI Sales Agent (native module) — Phase 2 foundation

This is a **new, native module** at `src/modules/sales-agent/`. It is deliberately separate from the website/WhatsApp assistant in `src/modules/ai-console/` and from CRM contacts. Migrations `0014`–`0016` are not modified.

## Status

| Capability | State |
| --- | --- |
| Overview with real tenant counts | Working once `0017` is applied |
| Manual saved searches (criteria only) | Working once `0017` is applied |
| Prospect add/edit/delete/status/import | Working once `0017` is applied |
| Server-side duplicate prevention | Working once `0017` is applied |
| Business discovery provider | **Unavailable** — no provider configured |
| Contact verification provider / manual attestation UI | **Unavailable** — schema only |
| AI email drafting, campaigns, approvals, outbox, replies | **Unavailable** — schema only, nothing can send |
| CRM conversion | Deferred |

All dashboard values are `count(*)` over real tables via `public.sales_dashboard_metrics`. Empty tables produce genuine zeros; no lead scores or demo data are generated.

## Apply the migration (local only)

```bash
cd ai-business-os
npx supabase db reset --local   # applies 0001..0017 plus supabase/seed.sql
psql "$DATABASE_URL" -f supabase/tests/ai_sales_agent.sql   # optional, rolls back
```

The hosted project has **not** been migrated. Do not run `supabase db push` or paste `0017` into the hosted SQL editor without an explicit decision — existing `0015`/`0016` are local-only too.

## Routes and navigation

- `/app/sales-agent` — Overview
- `/app/sales-agent/discovery` — Prospect discovery (manual saved searches)
- `/app/sales-agent/prospects` — Prospects

Sidebar group: **AI Sales Agent NEW**. Decision makers, AI email writer, Campaigns, Approvals and Replies are shown as planned (`/app/module/...`) and are not functional.

## Security model

- Every table has RLS `FOR SELECT TO authenticated USING (public.has_tenant_access(tenant_id))`. Browser code has **SELECT only**; there are no client `INSERT`/`UPDATE`/`DELETE` grants.
- All writes go through `SECURITY DEFINER` RPCs with `set search_path = ''`, fully qualified `public.*` names, and a membership check **before** any row is touched.
- Destructive actions (delete prospect) additionally require `public.can_manage_sales_agent(p_tenant)` — owner/admin of an active membership. Client roles are UX only, mirrored in `src/lib/permissions.ts`.
- Tenant-scoped unique partial indexes prevent duplicate prospects by email, normalized website and business name + city + country. The `sales_find_duplicate_prospect` RPC is a friendly pre-check; the indexes are authoritative.
- `public.sales_is_suppressed(p_tenant, p_email)` is the server-authoritative suppression lookup. Phase 3 sending must call it (or re-check the table) and must never trust a client flag.
- State changes are appended to the existing immutable `public.audit_logs` table (`sales.prospect_created`, `sales.prospect_updated`, `sales.prospect_deleted`, `sales.prospect_lead_status_changed`, `sales.search_saved`, `sales.prospects_imported`).
- A syntactically valid email is **never** marked verified. `contact_verifications` has a CHECK constraint requiring a provider reference or a human attestor for `status = 'verified'`, and no client can insert into it.
- No secrets are read by the browser. Provider keys, when added, must live in server-side Supabase secrets / Edge Functions and be referenced by name only. Never add them as `VITE_*`.

## Files

Created: `supabase/migrations/0017_ai_sales_agent.sql`, `supabase/tests/ai_sales_agent.sql`, `src/modules/sales-agent/{schemas,types,utils,api,hooks,schemas.test,utils.test}.ts*`, `src/modules/sales-agent/components/{StatusBadges,ProviderStatus,ProspectFormModal,SavedSearchFormModal}.tsx`, `src/modules/sales-agent/pages/{SalesAgentOverviewPage,ProspectDiscoveryPage,ProspectsPage}.tsx`, this file.

Modified: `src/types/database.ts`, `src/lib/permissions.ts`, `src/app/config/navigation.ts`, `src/app/layouts/AppLayout.tsx`, `src/app/router/index.tsx`, `README.md`.

## Exact next steps

1. Decide whether to apply `0017` (and the already-local `0015`/`0016`) to the hosted project; apply in order, never silently.
2. Verify Supabase auth redirects include the production origin before hosting.
3. Add provider abstractions (server-only) for discovery, verification and email; keep features failing closed until credentials exist.
4. Phase 3: AI email writer, campaign manager and approval inbox with manual approval as the default and server-side suppression checks.
5. Phase 4: reply handling, decision-maker research and CRM conversion through the existing `create_contact` RPC.
