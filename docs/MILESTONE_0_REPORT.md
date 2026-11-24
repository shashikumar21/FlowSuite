# Milestone 0 — verification and data safety report

Date: 2026-11-24
Scope: read-only hosted verification plus local implementation and hardening.

No hosted SQL writes, migrations, function deploys, hosted setting saves,
payment configuration, real messages or emails were performed. Local code was
verified, committed and pushed separately from hosted rollout. Hosted state is
unchanged and still requires explicit deployment approval.

## 1. Hosted verification results

| Check | Result |
| --- | --- |
| Public tables | 94 |
| Tables with RLS enabled | 94 / 94 |
| `SECURITY DEFINER` functions | 224 |
| Empty `search_path` | 223; the remaining one is `rls_auto_enable` with `pg_catalog` |
| `EXECUTE` granted to `anon` | 124 DEFINER functions |
| `EXECUTE` granted to `authenticated` | 205 DEFINER functions |
| Null ACL / implicit public execute | 0 |
| Migration history | `supabase_migrations.schema_migrations` is not visible to the CLI login role; object-level checks remain the source of truth |

### Function ACL finding on hosted

Patient-document, patient-email and payments service RPCs grant `EXECUTE` only
to `postgres`/`service_role`, which is the expected fail-closed shape.

However, most `ai_service_*` functions and all `billing_service_*` functions
still grant `EXECUTE` to `anon` and `authenticated` on hosted. The local
forward migration `0050_service_only_acl_hardening.sql` revokes those browser
roles and has been applied and tested locally only. Hosted ACLs were not changed.

### Dashboard/report enforcement finding on hosted

The hosted dashboard metric RPCs (`crm_dashboard_metrics`,
`booking_dashboard_metrics`, `inbox_metrics`, `sales_dashboard_metrics`,
`billing_get_usage`) call `has_tenant_access`, but their hosted definitions
contain no `has_tenant_role` check. `ReportsPage` uses `can('view_reports')` as
a UI-only gate.

The local forward migration `0051_view_reports_server_enforcement.sql` adds
the same role check inside the trusted server functions and preserves platform
admin access to usage. It has been applied and tested locally only. Hosted
RPCs were not changed.

### Platform admin role finding

Hosted `is_platform_admin` defaults to:

```sql
allowed_roles text[] DEFAULT ARRAY['super_admin', 'support']
```

The local UI previously asked for `['super_admin', 'support']`, which let
`support` open admin screens that other admin RPCs could still refuse. Local UI
access is now narrowed to `super_admin` only. The hosted function was not
changed; a policy decision is still needed on whether `support` should have
limited read-only admin access.

### Hosted function inventory

The hosted function list was reconciled. 17 functions are ACTIVE, including
four previously missing from the authoritative table:

- `razorpay-create-order`
- `razorpay-verify-payment`
- `razorpay-webhook`
- `patient-email-dispatch`

Stale version numbers in `docs/HOSTED_STATE.md` were corrected from the live
`supabase functions list` output. Hosted bundles were not redeployed. The new
`review-reply-suggest` function exists locally and passes Deno checks, but is
not deployed.

### Backup status

A schema-only dump was attempted twice (2026-11-22 and 2026-11-24) and failed
both times with `DockerRunError`. No backup file was produced. A real backup
**and restore drill into a non-production project** remain launch blockers.
Local Docker was later restored and local Supabase now starts successfully;
this does not replace the hosted backup/restore drill.

### Production origin

The authoritative docs, hosted `APP_URL` and CORS configuration point to Vercel.
The owner previously also quoted a Netlify URL. Final confirmation of the
canonical login origin is still required. Local Edge Function fallbacks were
changed from the old Netlify origin to `https://flow-suite-two.vercel.app`, but
hosted function bundles were not redeployed.

### Generated types

Directly replacing `src/types/database.ts` with CLI-generated types produced
612 TypeScript errors because generated RPC results are wider (`Json`) and many
columns are nullable. That change was reverted.

A read-only generated snapshot is stored at
`supabase/types/generated-database.ts` for schema comparison. It is not imported
by the app. The hand-written `src/types/database.ts` remains the application
contract. Only the new `google_review_url` field was added to that contract.

## 2. Local changes made

### CRM/Contacts-Leads

- Required-field validation and import parsing for contacts/leads.
- Zod schemas and regression tests.
- Contact form, import wizard and contacts page updates.
- Niche handling updates.

### Platform admin

- `src/app/providers/platformAdmin.ts` — new single-source constant,
  `['super_admin']`.
- `src/app/providers/platformAdmin.test.ts` — regression test.
- `src/app/providers/AuthProvider.tsx` — uses `PLATFORM_ADMIN_ROLES` when asking
  `is_platform_admin`.
- `src/app/providers/TenantProvider.tsx` — related provider correction.

### Review flow upgrade

- `0049_review_flow_upgrade.sql` — tenant Google review URL, replacement
  appointment-completed runner, owner-side AI draft state and metadata-only
  audit labels.
- `supabase/functions/review-reply-suggest/index.ts` — new Edge Function.
- `src/modules/reviews/api.ts`, `validation.ts` and `validation.test.ts`.
- `src/modules/settings/pages/BusinessSettingsPage.tsx` — Google review URL
  field.
- `src/modules/workflows/pages/WorkflowsPage.tsx` — Painter 4 Google default,
  custom URL preservation and AI reply UI.
- `src/types/database.ts` — new `google_review_url` field only.
- `supabase/tests/review_flow_upgrade.sql` — rolled-back SQL assertions.

### Security and test-harness hardening

- `0050_service_only_acl_hardening.sql` — revoke browser-role access to
  service-only tables/functions.
- `0051_view_reports_server_enforcement.sql` — server-side `view_reports`
  checks on five report RPCs.
- `0052_sales_email_approval_decision_fix.sql` — map `approve`/`reject` to the
  stored `approved`/`rejected` constraint values.
- `0053_sales_email_queue_idempotency_fix.sql` — check idempotency before the
  approved-status check.
- SQL test fixes in `billing_and_review_rls.sql`,
  `review_rating_followup.sql`, `workflows_local_runners.sql`,
  `milestone4_ai_service_rpcs.sql` and
  `milestone4_ai_qualification_rpcs.sql`.
- New `view_reports_enforcement.sql` rolled-back test.

### Documentation/reference

- `docs/HOSTED_STATE.md` — corrected function inventory, catalog counts, ACL
  notes, backup note, origin note and migration-history note.
- `docs/COMMERCIAL_LAUNCH_PACK.md` — commercialisation plan.
- `docs/REVIEW_FLOW_UPGRADE_PLAN.md` — approved design and deployment gates.
- `supabase/types/generated-database.ts` — generated reference snapshot.

## 3. Verification actually run

| Command | Result |
| --- | --- |
| `supabase start` | Pass; local stack on `127.0.0.1:54322` |
| `supabase migration up` | Pass; local migrations through `0053` |
| All 14 `supabase/tests/*.sql` files | Pass; each file rolled back |
| Deno check on all `supabase/functions/*/index.ts` | Pass, including `review-reply-suggest` |
| `npm run typecheck` | Pass |
| `npm test` | Pass — 59 files, 421 tests |
| `npm run lint` | Pass with pre-existing warnings only; no new blocking warnings |
| `npm run build` | Pass |
| `git diff --check` | Pass; only CRLF line-ending warnings |
| Read-only `supabase db query --remote=... --read-only` | Pass |
| Read-only `supabase functions list` | Pass |
| Read-only `supabase gen types typescript --remote=...` | Pass |
| `supabase db dump --remote=... --schema public` | Failed — `DockerRunError` |

The full SQL suite initially exposed three extra problems: two stale test
helpers that did not switch the database role to `service_role`, and two real
sales-email bugs. All were fixed locally and the full suite now passes.

## 4. Deployment requirements / owner-only actions

Before public selling or closing Milestone 0, the owner must:

1. Confirm the canonical production origin and verify Auth Site URL/redirects.
2. Take a hosted backup and complete a restore drill into a non-production project.
3. Decide the `support` role policy: no admin UI, or limited read-only admin UI.
4. Explicitly approve applying local forward migrations `0049`–`0053` to hosted.
5. Explicitly approve deploying `review-reply-suggest`.
6. Confirm the AI provider secret names used by `ai-chat` may be reused. Never
   paste secret values into chat.
7. Configure tenant-owned Razorpay keys, webhook and a test payment.
8. Approve legal/commercial documents: Terms, Privacy, refund, DPDP consent and
   retention/deletion policy.
9. Approve any real WhatsApp send after the migration is live.

No hosted change should be made until explicit deployment approval is given.

## 5. Production-verified vs local-only

### Production-verified

- Hosted tables and RLS catalog state.
- Hosted Edge Function inventory and versions.
- Reports and dashboard browser smoke tests from earlier work.
- Payments gateway status is fail-closed until tenant keys/webhook are configured.
- Patient email dispatch remains fail-closed; no scheduler is configured.

### Local-only, verified and committed

- Contacts/Leads required-field validation.
- `super_admin`-only admin UI narrowing.
- Vercel fallback URL changes in two Edge Function sources.
- Generated types reference snapshot.
- Review flow upgrade, including Google URL and owner-side AI draft.
- Service-only RPC ACL hardening.
- Server-side report-role enforcement.
- Sales-email approval/idempotency fixes.
- Commercial and Milestone 0 documentation.

### Not verified / blocked

- Hosted backup and restore.
- Hosted acceptance of local migrations `0049`–`0053`.
- Hosted deployment of `review-reply-suggest`.
- Real Razorpay payment and webhook delivery.
- WhatsApp patient-data flows.
- Real patient email dispatch.
- Hosted acceptance of the corrected fallback URLs (requires redeploy).

## 6. Milestone 0 closing decisions needed

Milestone 0 can be closed once the owner answers:

1. Is Vercel the final canonical login/production origin?
2. Should `support` have no admin UI access, or limited read-only access?
3. Should the local `view_reports` enforcement be applied to hosted now?
4. Should the local service-only RPC ACL hardening be applied to hosted now?
5. Has a backup and restore drill been completed?
6. Are the review-flow migrations and Edge Function approved for hosted rollout?

No hosted change should be made until those answers and explicit deployment
approval are given.
