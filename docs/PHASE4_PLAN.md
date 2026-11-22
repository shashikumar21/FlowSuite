# Phase 4 — decision makers, verification evidence, signals and replies

Status: plan written before implementation. Local-only code and migration;
nothing here is applied to hosted or deployed.

Scope: manage decision makers inside each prospect, record manual verification
evidence and research signals, and record/triage outreach replies manually.
Out of scope: any live discovery/verification/email provider, any real email
delivery, any hosted migration, any Edge Function deployment, any invented
metric, and Phase 3 promotion.

## Inspection result

`0017_ai_sales_agent.sql` already created `decision_makers`,
`contact_verifications`, `prospect_signals` and `outreach_replies`, all with RLS
SELECT-only for authenticated tenant members. There are **no RPCs** for any of
them, so browser code cannot write them today. `contact_verifications` has a
CHECK requiring a named provider or a human attestor before `status='verified'`.

Only one new migration is needed: `0020_phase4_contacts_replies.sql`. It adds
RPCs only; no table in `0017` is recreated or altered destructively.

## Database — new file only

`supabase/migrations/0020_phase4_contacts_replies.sql` adds `SECURITY DEFINER`
RPCs with `set search_path = ''`, fully qualified `public.*` names,
`has_tenant_access(p_tenant)` first, and an audit entry:

- `sales_create_decision_maker`, `sales_update_decision_maker`,
  `sales_delete_decision_maker` — tenant/prospect ownership enforced in SQL;
  duplicate emails are rejected using the existing unique index; the delete is
  owner/admin only.
- `sales_record_verification` — append-only evidence. Only `method='manual'`
  is accepted until a real provider exists server-side; `verified` therefore
  always names the human who attested (`auth.uid()`), never a fabricated
  provider. Updates the entity's `verification_status` in the same transaction.
- `sales_add_signal`, `sales_delete_signal` — research notes. Delete is
  owner/admin only.
- `sales_record_reply`, `sales_update_reply`, `sales_delete_reply` — manual
  reply ingestion and triage. `classification='unsubscribe'` writes the sender
  to `suppression_list` server-side with reason `unsubscribe`; the RPC is the
  only path. Delete is owner/admin only.
- Every function is `REVOKE`d from `public, anon` and `GRANT`ed to
  `authenticated`.

## Client module — `src/modules/sales-agent/contacts/`

- `schemas.ts` — Zod for decision maker, verification, signal and reply forms.
  Mirrors DB constraints; the RPCs remain authoritative.
- `utils.ts` — email normalisation, verification/status labels, safe provider
  constant for manual replies.
- `api.ts` / `hooks.ts` — tenant-scoped reads and RPC wrappers, cache
  invalidation via the existing `salesAgentKeys`.
- `components/DecisionMakerFormModal.tsx`, `VerificationModal.tsx`,
  `ReplyFormModal.tsx` — small reusable UI built from existing primitives.
- `pages/DecisionMakersPage.tsx`, `pages/RepliesPage.tsx` — real data only,
  honest empty states, no delivery metrics.
- `*.test.ts` — validation, suppression-on-unsubscribe and tenant scoping.

## Wiring — modified

- `src/types/database.ts` — additive RPC arg/return types only.
- `src/app/router/index.tsx` — two new `/app/sales-agent/*` routes.
- `src/app/config/navigation.ts` — replace the two planned placeholders.
- `src/modules/sales-agent/pages/SalesAgentOverviewPage.tsx` — live links.
- `README.md`, `docs/AI_SALES_AGENT.md`, `docs/HOSTED_STATE.md` — record status.

## Verification

`npm run typecheck`, `npm test`, `npm run lint`, `npm run build`,
`git diff --check`, plus browser smoke of both routes and the existing pages.
No hosted writes, no deploys, no emails, no invented metrics.
