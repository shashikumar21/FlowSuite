# Tasks — local only

The former `Tasks` placeholder is now a real tenant-scoped module:

| Route | What it does | What it deliberately does not do |
| --- | --- | --- |
| `/app/tasks` | Lists saved tasks with owner, due date and status; counts come only from fetched rows | No completion rate, forecast, reminder or invented productivity metric |

The module reuses the existing `public.tasks` table from
`0001_core_foundation.sql`. It does **not** recreate the table and does not
touch any hosted database object.

## Security contract

- Migration `0022_tasks_module.sql` is **local only**. It has not been applied
  to the hosted project and no earlier migration was edited.
- The broad `0001` policy `"Tenant tasks access"` (`FOR ALL`) is replaced with
  `SELECT`-only RLS guarded by `public.has_tenant_access(tenant_id)`.
- Browser code is granted `SELECT` only. All writes go through four
  `SECURITY DEFINER` RPCs that re-check `public.has_tenant_access(p_tenant)`
  and write to the existing immutable `public.audit_logs`.
- A task owner must be an **active** member of the same tenant. This is checked
  server-side on create and update; the UI dropdown is only a convenience.
- `tasks_set_status` stamps `completed_by = auth.uid()` and `completed_at =
  now()` when a task becomes completed, and clears both when it is reopened.
  The client never sends an actor identity or completion timestamp.
- `tasks_delete_task` additionally requires
  `public.can_manage_sales_agent(p_tenant)`. The owner/admin button check in
  the UI is only a convenience.
- Client form input is validated with Zod before an RPC call; the SQL CHECK
  constraints remain the authoritative enforcement point.
- No API key, provider name, `VITE_*` secret, notification queue or webhook was
  added. No email, SMS or WhatsApp message is sent.

## Files

- `supabase/migrations/0022_tasks_module.sql` — additive columns, RLS/grants
  and four trusted RPCs.
- `src/types/database.ts` — additive task status, row and RPC types.
- `src/modules/tasks/` — schemas, API, hooks, utils, component, page and tests.
- `src/app/router/index.tsx` and `src/app/config/navigation.ts` — real route
  and sidebar link.
- `src/modules/dashboard/pages/DashboardPage.tsx` — quick link only; dashboard
  metrics are unchanged.

## Local checks

```powershell
npm run typecheck
npm test -- --run
npm run lint
npm run build
git diff --check
```

Because no local Postgres is available on this machine, the migration has not
been executed. The hosted project still has the original `0001` `tasks` table
shape and broad write policy, and none of the `tasks_*` RPCs exist there. The
local UI therefore shows schema-cache errors until a deliberate promotion is
approved. Do not promote `0022` to hosted without an explicit owner approval
and a fresh backup.
