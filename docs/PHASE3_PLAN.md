# Phase 3 — file-by-file implementation plan

Status: plan written after Phase 1 inspection; implementation follows this file.
Scope: AI Email Writer, Campaign Manager, Approval Inbox, sending preparation.
Out of scope: Phase 4 discovery/verification, Phase 5 replies, any live provider,
any hosted migration, any Edge Function deployment, any real email.

## Inspection result (why the plan looks like this)

`0017_ai_sales_agent.sql` already created `outreach_campaigns`, `outreach_messages`,
`outreach_outbox`, `suppression_list`, `decision_makers` and `contact_verifications`,
plus `sales_is_suppressed(p_tenant, p_email)`. There is **no** approvals table,
**no** campaign/draft/approval RPC, and **no** email provider config. Therefore
Phase 3 must extend, not recreate: one new migration adds only the missing
objects; all existing tables are reused as-is (with additive columns where a
generated draft needs to be stored).

## Database — new files only

- `supabase/migrations/0019_phase3_email_outreach.sql`
  - Additive columns on `outreach_campaigns` (`product_offered`, `problem_addressed`)
    and `outreach_messages` (`decision_maker_id`, `opening`, `cta`,
    `follow_up_subject`, `follow_up_body`, `generation_source`, `submitted_at`).
  - New tenant-scoped `sales_email_approvals` table (decision history), RLS
    SELECT only, no client write grants.
  - SECURITY DEFINER RPCs, all with `has_tenant_access()` first and an audit log:
    `sales_create_campaign`, `sales_save_email_draft`, `sales_submit_for_approval`,
    `sales_review_email_draft`, `sales_queue_approved_email`,
    `sales_add_suppression`, `sales_mark_outbox_failed`, `sales_retry_outbox`,
    `sales_campaign_summary`.
  - Server-authoritative: suppression re-checked at submit/approve/queue;
    approval restricted by `can_manage_sales_agent`; queue idempotency uses the
    existing unique `(tenant_id, idempotency_key)` on `outreach_outbox`.
  - `REVOKE ... FROM public, anon`, `GRANT ... TO authenticated`.
- `supabase/tests/ai_sales_agent_phase3.sql` — rolled-back local SQL regression
  suite for permissions, suppression, duplicates and tenant isolation.

## Type definitions — modified

- `src/types/database.ts` — additive Row type for `sales_email_approvals`,
  additive columns on existing Row types, and RPC arg/return types.

## New client module — `src/modules/sales-agent/outreach/`

- `schemas.ts` — Zod for draft inputs, strict generated output, campaign create,
  approval decision. (Client validation only; RPCs stay authoritative.)
- `utils.ts` — email normalisation/validation, suppression matching,
  deterministic idempotency key, UX-only approval permission helper.
- `ai-draft.ts` — provider-neutral prompt builder + `generateEmailDraft(input,
  provider)` calling the existing `AiProvider` structured-output interface and
  validating the response with the strict Zod schema. No env access.
- `api.ts` — REST selects plus RPC wrappers; invokes the draft Edge Function and
  maps a missing/unconfigured provider to an explicit error.
- `hooks.ts` — tenant-scoped TanStack Query keys and invalidation.
- `types.ts` — view-model types.
- `components/CampaignFormModal.tsx`, `components/DraftEditor.tsx`,
  `components/ApprovalRow.tsx` — small reusable UI built from existing
  `Modal`/`Card`/`Input`/`Badge`/`Button`/`Feedback` primitives.
- `pages/CampaignsPage.tsx`, `pages/EmailWriterPage.tsx`,
  `pages/ApprovalsPage.tsx`, `pages/SendingPage.tsx` — four routes, real data
  only, empty states when tables are empty.
- `*.test.ts` — validation, AI draft generation (injected fake provider),
  idempotency/suppression/permission logic.

## Edge Function source — new file, NOT deployed

- `supabase/functions/sales-email-draft/index.ts` — thin authenticated wrapper:
  validates input, checks tenant membership with the caller JWT, injects
  `OPENAI_API_KEY`/`OPENAI_BASE_URL`/`OPENAI_MODEL` from server secrets, reuses
  `_shared/ai/provider.ts`, returns a validated draft. Fails closed when the key
  is absent. No service-role writes, no sends. Deployment is explicitly out of
  scope, so the UI must report "draft service not available" until it is deployed.

## Wiring — modified

- `src/app/router/index.tsx` — four new `/app/sales-agent/*` routes.
- `src/app/config/navigation.ts` — replace four planned placeholders with real
  links; keep decision makers and replies as planned (Phase 4/5).
- `src/lib/permissions.ts` — no new role logic needed; reuse
  `manage_sales_agent` for UX gating (the DB remains authoritative).
- `src/modules/sales-agent/pages/SalesAgentOverviewPage.tsx` — replace stale
  "Phase 3 planned" entries with live links; keep provider status honest.
- `README.md` and `docs/AI_SALES_AGENT.md` — record what works and what still
  needs credentials/migration application.

## Verification

`npm run typecheck`, `npm test`, `npm run build`, `npm run lint`,
`git diff --check`, plus a browser smoke test of each new route. No hosted
writes, no deploys, no emails, no invented metrics.
