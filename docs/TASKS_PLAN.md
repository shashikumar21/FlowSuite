# Tasks — file-by-file implementation plan

Status: planned. This module is **local only**; no hosted migration, function
deploy, secret change or provider call is part of this work. See
[docs/TASKS.md](TASKS.md) for the final module contract once implemented.

Scope: replace the `Tasks` placeholder in the Operations sidebar with a real
tenant-scoped Tasks screens backed by the existing `public.tasks` table:
title, description, owner, due date, status and honest empty states.

Out of scope: hosted migration promotion, Edge Function deploys, email/SMS/WhatsApp
notifications, schedulers, AI assignment, invented productivity metrics and any
`VITE_*` provider key.

## Inspection result

`public.tasks` already exists in `0001_core_foundation.sql` with `id`,
`tenant_id`, `title`, `description`, `assigned_to`, `due_at`, `status`
(`pending`/`in_progress`/`completed`), `created_at` and `updated_at`. It already
has the `tasks_tenant_idx` index and `tasks_set_updated_at` trigger. The table
must be reused, not recreated.

The `0001` policy `"Tenant tasks access"` is `FOR ALL`, and `authenticated` has
`insert`, `update` and `delete`. That is too broad for the trusted-RPC contract
used by Phase 3, Phase 4 and Growth. `navigation.ts` still declares
`planned('Tasks', 'tasks', FileText)`, and `moduleTitles.tasks` still says
`Phase 2`.

## Database — one new local-only file

`supabase/migrations/0022_tasks_module.sql` will:

1. Add only the missing additive columns to the existing table:
   `created_by uuid`, `completed_by uuid` and `completed_at timestamptz`, with
   composite foreign keys to `business_members(tenant_id, user_id)` for the two
   actor columns. Existing rows are untouched.
2. Drop the broad `0001` `FOR ALL` policy and replace it with a single
   `SELECT`-only policy guarded by `public.has_tenant_access(tenant_id)`.
3. `REVOKE ALL ... FROM public, anon, authenticated` and `GRANT SELECT ... TO
   authenticated`, leaving writes exclusively to trusted RPCs.
4. Add `SECURITY DEFINER` RPCs with `set search_path = ''`, fully qualified
   `public.*` names and `auth.uid()`/`has_tenant_access(p_tenant)` checks:
   - `tasks_create_task` — validates title/description/date, checks that any
     assignee is an **active** member of the same tenant, stamps `created_by`;
   - `tasks_update_task` — rechecks tenant ownership and the active assignee,
     and deliberately accepts no status or actor field;
   - `tasks_set_status` — validates the status transition and stamps
     `completed_by`/`completed_at` on the server when the task becomes
     `completed`, clearing both when it is reopened;
   - `tasks_delete_task` — additionally requires
     `public.can_manage_sales_agent(p_tenant)` for the destructive action.
5. Write an entry to the existing immutable `public.audit_logs` for every RPC
   write. Execute is revoked from `public`/`anon` and granted only to
   `authenticated`.

No earlier migration is edited. No hosted SQL is submitted.

## Client module — `src/modules/tasks/`

- `schemas.ts` — Zod form and status schemas; title length, description cap,
  UUID owner and ISO due date. The SQL constraints remain authoritative.
- `utils.ts` — status labels/variants and owner-admin UI hint. The server
  re-checks delete permission regardless of this hint.
- `types.ts` — summary derived only from rows returned by tenant-scoped reads.
- `api.ts` — tenant-scoped `SELECT` for tasks, active-member assignee options
  reused from the Sales Agent read pattern, and RPC wrappers that never send
  `tenant_id` from the row, an actor identity or a completion timestamp.
- `hooks.ts` — react-query keys hung off `salesAgentKeys.all(tenantId)` and
  mutations that invalidate all tenant views after a trusted write.
- `components/TaskFormModal.tsx` — create/edit form built from existing UI
  primitives, with honest validation messages.
- `pages/TasksPage.tsx` — real list, status actions, owner/admin delete,
  loading/error and empty states. Counts come only from fetched rows; there is
  no fabricated completion rate.
- `schemas.test.ts`, `rpc.test.ts`, `utils.test.ts` — validation bounds,
  tenant-scoped RPC arguments, no client role/actor/completion bypass and
  no-provider behavior.

## Wiring — modified

- `src/types/database.ts` — additive `TaskStatus`, task row fields, RPC types.
- `src/app/router/index.tsx` — real `/app/tasks` route.
- `src/app/config/navigation.ts` — replace the placeholder with a real
  Operations link and update the module title phase.
- `src/modules/dashboard/pages/DashboardPage.tsx` — add a Tasks quick link if
  the existing quick-links area makes it natural, without changing dashboard
  metrics.
- `README.md`, `docs/HOSTED_STATE.md`, `docs/TASKS.md` — record local-only
  status and the fact that the hosted `tasks` table still has the broad `0001`
  policy until a deliberate promotion is approved.

## Verification

`npm run typecheck`, `npm test -- --run`, `npm run lint`, `npm run build`,
`git diff --check`, and a browser smoke of `/app/tasks` plus existing routes.
No local Postgres is available on this machine, so `0022` cannot be executed
locally; this limitation will be recorded in the final module doc.
