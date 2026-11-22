# AI Sales Agent (native module) — Phase 2 + Phase 3 + Phase 4

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
| Contact verification provider | **Unavailable** — no provider configured |
| Manual verification evidence / decision makers / research signals | Code complete locally; needs `0020` applied |
| Manual reply recording and triage | Code complete locally; needs `0020` applied. **No inbox provider** |
| AI email writer (generate + edit + save drafts) | Code complete locally; needs `0019` applied and the undeployed draft function deployed |
| Campaign manager (create + select recipients + real drafts) | Code complete locally; needs `0019` applied |
| Approval inbox with server-enforced decisions and history | Code complete locally; needs `0019` applied |
| Send queue, idempotency, suppression, failure/retry controls | Code complete locally; needs `0019` applied. **No provider, nothing sends** |
| Live email delivery / provider-backed replies | **Unavailable** — no provider configured |

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
- `/app/sales-agent/campaigns` — Campaign manager (Phase 3)
- `/app/sales-agent/email-writer` — AI Email Writer (Phase 3)
- `/app/sales-agent/approvals` — Approval inbox and history (Phase 3)
- `/app/sales-agent/sending` — Sending preparation / suppression (Phase 3)
- `/app/sales-agent/decision-makers` — People, manual verification, research signals (Phase 4)
- `/app/sales-agent/replies` — Manual reply recording and triage (Phase 4)

Sidebar group: **AI Sales Agent NEW**. All eight links are live; provider-backed discovery, verification and email delivery remain unavailable.

**Important:** migrations `0019_phase3_email_outreach.sql` and `0020_phase4_contacts_replies.sql` were **not applied to hosted**, and the `sales-email-draft` Edge Function was **not deployed**. The new pages therefore show a clear database/service error rather than fake data until those local-only changes are deliberately promoted. See `docs/HOSTED_STATE.md`.

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

## Phase 3 — AI Email Writer, Campaigns, Approvals and sending preparation

Phase 3 extends `0017` rather than recreating anything. `0017` already provides `outreach_campaigns`, `outreach_messages`, `outreach_outbox`, `suppression_list`, `decision_makers`, `contact_verifications` and `sales_is_suppressed`. The only new migration is `0019_phase3_email_outreach.sql`, which adds:

- additive columns on campaigns/messages (product, problem, decision maker, opening, CTA, follow-ups, generation source, submitted time);
- `sales_email_approvals` — read-only history table, tenant scoped;
- nine trusted RPCs: `sales_create_campaign`, `sales_save_email_draft`, `sales_submit_for_approval`, `sales_review_email_draft`, `sales_queue_approved_email`, `sales_add_suppression`, `sales_mark_outbox_failed`, `sales_retry_outbox`, `sales_campaign_summary`.

Security invariants (all enforced server-side, never by the client):

- `has_tenant_access(p_tenant)` is the first check in every RPC; the database unique indexes are the backstop for duplicate recipients and duplicate queue rows.
- `can_manage_sales_agent(p_tenant)` (owner/admin) is required for approval, queueing, suppression changes, failure marking and retries. The `canReviewOutreach()` helper in the UI is UX only.
- `sales_is_suppressed()` is re-checked at submit, approval and queue time — a stale client suppression list cannot bypass it.
- Queue rows always have `provider = NULL`. No Edge Function sends mail; `sales_campaign_summary` counts real rows and never reports delivery, opens or clicks.
- Zod validates all draft input and model output. The model must return an exact strict JSON shape; unknown fields and drift are rejected.
- The draft Edge Function source verifies the caller JWT and active membership with the caller's own client (RLS applies), reads `OPENAI_*` secrets from `Deno.env`, and never writes to the database. It is **not deployed**; the UI reports "draft service not available" until it is.

The `sales-email-draft` function must be deployed with the existing import map and the server secrets already configured for `ai-chat` (rotate the Groq key first — see `docs/HOSTED_STATE.md`). No new `VITE_*` variables are introduced.

## Phase 4 — decision makers, verification evidence, signals and replies

Phase 4 extends `0017` (and assumes `0019` for outreach context). The four tables
`decision_makers`, `contact_verifications`, `prospect_signals` and
`outreach_replies` already exist in `0017` with RLS SELECT only; there were no
RPCs to write them. The only new migration is
`supabase/migrations/0020_phase4_contacts_replies.sql` — **local only, not applied
to hosted**. It adds nine trusted RPCs:

- `sales_create_decision_maker`, `sales_update_decision_maker`, `sales_delete_decision_maker`
- `sales_record_verification`
- `sales_add_signal`, `sales_delete_signal`
- `sales_record_reply`, `sales_update_reply`, `sales_delete_reply`

Security invariants:

- `has_tenant_access(p_tenant)` is checked first in every RPC; tenant/prospect
  ownership is checked on the row before update/delete.
- Destructive actions (deletes) additionally require
  `public.can_manage_sales_agent(p_tenant)` — owner/admin. The
  `canManageContacts()` helper in the UI is UX only.
- `sales_record_verification` accepts **only** `method='manual'`. A `verified`
  result stores `checked_by = auth.uid()`, so a human is always named and no
  browser can fabricate a provider result. Evidence is append-only.
- Classifying a reply as `unsubscribe` inserts the sender into
  `suppression_list` inside the same RPC. The client never sends a suppression
  flag; the server derives it from the authoritative classification.
- `provider='manual'` for recorded replies. There is no inbox polling, webhook,
  provider configuration or email send.
- All functions use `set search_path = ''`, fully qualified `public.*` names,
  `REVOKE ... FROM public, anon` and `GRANT ... TO authenticated`, and append
  audit entries. Form input is validated with Zod; the RPCs remain authoritative.

## Files

Created: `supabase/migrations/0017_ai_sales_agent.sql`, `supabase/migrations/0018_sales_prospect_contact_conversion.sql`, `supabase/tests/ai_sales_agent.sql`, `src/modules/sales-agent/{schemas,types,utils,api,hooks,schemas.test,utils.test}.ts*`, `src/modules/sales-agent/components/{StatusBadges,ProviderStatus,ProspectFormModal,SavedSearchFormModal}.tsx`, `src/modules/sales-agent/pages/{SalesAgentOverviewPage,ProspectDiscoveryPage,ProspectsPage}.tsx`, this file.

Modified: `src/types/database.ts`, `src/lib/permissions.ts`, `src/app/config/navigation.ts`, `src/app/layouts/AppLayout.tsx`, `src/app/router/index.tsx`, `README.md`.

### Phase 3 additions

Created: `docs/PHASE3_PLAN.md`, `docs/HOSTED_STATE.md`, `supabase/migrations/0019_phase3_email_outreach.sql` (local only, **not applied to hosted**), `supabase/tests/ai_sales_agent_phase3.sql` (rolled back, not executed), `supabase/functions/sales-email-draft/index.ts` (**not deployed**), `src/modules/sales-agent/outreach/{schemas,types,utils,ai-draft,api,hooks}.ts`, `src/modules/sales-agent/outreach/components/{CampaignFormModal,DraftEditor,ApprovalRow}.tsx`, `src/modules/sales-agent/outreach/pages/{CampaignsPage,EmailWriterPage,ApprovalsPage,SendingPage}.tsx`, and `schemas.test.ts`, `utils.test.ts`, `ai-draft.test.ts`, `rpc.test.ts`.

Modified: `src/types/database.ts` (additive Phase 3 rows/RPCs), `src/app/router/index.tsx`, `src/app/config/navigation.ts`, `src/modules/sales-agent/pages/SalesAgentOverviewPage.tsx`, `.gitignore`.

### Phase 4 additions

Created: `docs/PHASE4_PLAN.md`, `supabase/migrations/0020_phase4_contacts_replies.sql` (local only, **not applied to hosted**), `src/modules/sales-agent/contacts/{schemas,utils,api,hooks}.ts`, `src/modules/sales-agent/contacts/components/{DecisionMakerFormModal,VerificationModal,SignalFormModal,ReplyFormModal}.tsx`, `src/modules/sales-agent/contacts/pages/{DecisionMakersPage,RepliesPage}.tsx`, and `schemas.test.ts`, `rpc.test.ts`.

Modified: `src/types/database.ts` (additive Phase 4 RPC args/returns), `src/app/router/index.tsx`, `src/app/config/navigation.ts`, `src/modules/sales-agent/pages/SalesAgentOverviewPage.tsx`, `README.md`, `docs/HOSTED_STATE.md`.

## Exact next steps

1. Rotate the exposed Groq key and update the hosted `OPENAI_API_KEY` secret (see `docs/HOSTED_STATE.md`).
2. On a **local** Supabase with Docker running: apply `0019` and `0020`, then run `supabase/tests/ai_sales_agent.sql` and `supabase/tests/ai_sales_agent_phase3.sql`; both files roll back. Add a rolled-back Phase 4 SQL regression test covering tenant isolation, manual-only verification and unsubscribe suppression, then execute it. No local Postgres is available on this machine, so `0020` has **not** been DB-verified.
3. Create a hosted backup before any future promotion; the schema dump attempt on 2026-11-22 failed because Docker was unavailable.
4. Only after review: apply `0019` to hosted and deploy `sales-email-draft` with the existing import map. Re-run the read-only inventory in `HOSTED_STATE.md` afterwards to record the new state.
5. Verify Supabase auth redirects include the production origin before hosting.
6. Do not proceed beyond Phase 4 until the Phase 4 report has been reviewed. Never apply `0019`/`0020`, deploy functions, rotate secrets or send email without explicit approval.
