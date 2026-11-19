# FlowSuite — AI Business OS

One platform. Every business. Smarter growth.

FlowSuite is an original, India-first, multi-tenant SaaS business operating system inspired by the **feature categories** of Grexa.ai and GoHighLevel. One business = one tenant; each tenant can have multiple employees; super admins are a completely separate platform role.

This repository contains **Milestone 1 — secure multi-tenant foundation** plus **Milestone 2 — core CRM**. Booking, AI, workflow, marketing, billing and advanced reporting modules are still intentionally planned screens rather than fake implementations.

---

## Implemented

### Milestone 1 — foundation

| Area | Status |
| --- | --- |
| React + TypeScript + Vite + Tailwind v4 | Done |
| Supabase typed client (publishable key only) | Done |
| Email signup, login, password reset, password update | Done |
| Profile creation via trusted Auth trigger | Done |
| Business registration with atomic tenant + owner provisioning RPC | Done |
| Industry template application (pipeline + booking defaults) | Done |
| Team membership, invitations with expiring email-bound tokens | Done |
| Owner/admin/manager/employee roles + trigger-protected invariants | Done |
| Tenant switching persisted per user | Done |
| Protected routes, onboarding guard, platform admin guard | Done |
| Fully responsive app shell (sidebar + topbar + mobile drawer) | Done |
| Dashboard with **real** tenant-scoped counts (no mock data) | Done |
| Team management, business settings, profile settings | Done |
| Super admin overview, businesses and plans screens | Done |
| PostgreSQL RLS + least-privilege grants for every table | Done |
| RLS regression test script for cross-tenant attacks | Done (executed on hosted project, rolled back) |

### Milestone 2 — core CRM

| Area | Status |
| --- | --- |
| Contacts/leads with search, filters, detail drawer, assignment and tags | Done |
| Activity timeline (note, call, email, meeting, task) on every contact | Done |
| Tenant-scoped lead sources, tags, custom fields and CRM setup screen | Done |
| Deal pipelines with `@dnd-kit` drag-and-drop Kanban board | Done |
| Keyboard-accessible stage change from the deal detail modal | Done |
| Permission-gated CRM overview with real tenant/visibility-scoped metrics | Done |
| Dashboard CRM cards read the same `crm_dashboard_metrics` RPC | Done |
| Employees see assigned records plus unassigned leads and can claim them | Done |
| Employees cannot reassign other records or write CRM configuration | Done (DB + UI) |
| Tenant-aware composite FKs, indexes, RLS and trusted RPCs | Done |
| CRM security/workflow regression suite (37 checks) | Done (executed on hosted project, rolled back) |

**Still not built:** booking pages, WhatsApp/AI integrations, workflow builder, campaigns, reputation, website builder, Razorpay billing and advanced analytics. See `src/app/config/navigation.ts` for the planned module map.

---

## Tech stack

- **Frontend:** React 19, TypeScript (strict), Vite 8, Tailwind CSS 4, React Router 7
- **Data/state:** TanStack Query 5, React Hook Form, Zod
- **CRM board:** `@dnd-kit/core`, `@dnd-kit/sortable`
- **Charts:** semantic CSS bars (no chart dependency added)
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions)
- **Icons:** Lucide React
- **Testing:** Vitest + Testing Library, SQL-based RLS/security tests

---

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start a Supabase backend

Option A — local (requires Docker):

```bash
npx supabase init
npx supabase start
```

Option B — hosted project: create a project at supabase.com.

### 3. Apply migrations and seed

```bash
npx supabase db reset --local   # applies migrations + supabase/seed.sql
# For a hosted project: npx supabase db push, then run supabase/seed.sql in the SQL editor
```

For the hosted project already configured in `.env.local`, the SQL files were run in the dashboard SQL Editor in this order:

1. `0001_core_foundation.sql`
2. `0002_business_configuration.sql`
3. `0003_fix_invitation_token.sql`
4. `supabase/seed.sql`
5. `0004_milestone2_crm.sql`
6. `0005_fix_crm_visibility.sql`

`0004` already contains the `0005` visibility fix for fresh installs; `0005` exists so an already-migrated database can be patched on its own. There is no `supabase/config.toml`, so hosted migrations were applied manually through the SQL Editor.

Email auth is enabled. Redirect URLs allow `http://localhost:5173/**` and `http://127.0.0.1:5173/**`, and the Site URL is `http://localhost:5173`. Add your production origin before deploying.

### 4. Add environment variables

```bash
cp .env.example .env.local
```

Fill in:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-or-publishable-key
```

> Never put a service-role key, database URL, AI key or Razorpay secret in a `VITE_*` variable. Those belong in Supabase Edge Functions / server secrets.

### 5. Create the first platform admin (optional)

After signing up, insert a row in `public.platform_admins` from the SQL editor with your `auth.users.id` and role `super_admin`. This table is intentionally unreachable from the browser.

### 6. Run the app

```bash
npm run dev
```

If the environment variables are missing, the app shows a setup screen instead of silently rendering an unauthenticated UI.

---

## Project structure

```
src/
  app/
    config/          navigation + module map
    layouts/         AuthLayout, AppLayout, AdminLayout
    pages/           setup-required, 404
    providers/       Auth, Tenant, Toast, root providers
    router/          routes + guards
  components/
    ui/              Button, Input, Card, Badge, Modal, feedback primitives
    ContactFormModal, DealFormModal, ContactDetailModal, DealDetailModal, StatusBadges
  integrations/
    supabase/        typed client and env access (single source of truth)
  lib/               cn, format, permissions, error helpers (+ unit tests)
  modules/
    auth/            schemas + login/signup/reset pages
    onboarding/      business creation
    dashboard/       overview + planned-module screens
    team/            team management + invitation acceptance
    settings/        business and profile settings
    admin/           super admin screens
    crm/             api, hooks, schemas, utils, pages, board, tests
  types/             hand-written Supabase Database type
supabase/
  migrations/        0001–0005
  seed.sql           plans only — no fake businesses or contacts
  tests/             foundation_rls.sql, milestone2_crm.sql
```

Regenerate types once a real project exists:

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

---

## Database and security model

- Every tenant-owned table has a non-null `tenant_id`.
- Composite foreign keys such as `(pipeline_id, tenant_id)`, `(contact_id, tenant_id)` and `(stage_id, pipeline_id, tenant_id)` prevent cross-tenant relationships.
- Money uses `numeric`, timestamps are UTC, display defaults to INR / Asia/Kolkata.
- RLS is enabled on every table; `platform_admins` has no client policies and all privileges revoked from `anon`/`authenticated`.
- Authorization helpers (`has_tenant_access`, `has_tenant_role`, `is_platform_admin`, `can_manage_crm`, `can_edit_contact`, `can_edit_deal`) are `security definer` with `search_path = ''`.
- Sensitive operations use trusted RPCs: provisioning, invitations, templates, CRM create/update/claim/move/delete operations, dashboard metrics and admin reads.
- Triggers prevent self-promotion, owner-role changes by non-platform-admins, and removal of the last owner.
- Client-side `hasPermission()` only hides controls; the database remains authoritative.
- `audit_logs` is append-only from the client's perspective and readable only by tenant admins and platform admins.

### Milestone 2 authorization rules

- `owner` / `admin` / `manager` can manage CRM configuration and all tenant CRM records.
- `employee` can view assigned contacts/deals and unassigned leads, can claim an unassigned lead, and cannot reassign other people's records or change pipelines/stages/sources/tags/custom fields.
- CRM metrics are computed by a tenant-scoped RPC and respect the same visibility rules, so an employee's overview cannot leak owner-only figures.
- Invitation INSERT is RPC-only; configuration writes are owner/admin/manager-only; the `app.invitation_accept` GUC bypass is narrow and only applies to the caller's own active non-owner membership in the invited tenant.

### Migration sequence

| Migration | Contents |
| --- | --- |
| `0001_core_foundation.sql` | profiles, businesses, memberships, invitations, platform admins, plans, subscriptions, core CRM tables, audit log, helpers, RPCs, RLS, grants |
| `0002_business_configuration.sql` | business settings, branches, industry templates, template modules, tenant template settings, 10 India-focused industry templates |
| `0003_fix_invitation_token.sql` | invitation tokens use built-in `gen_random_uuid()` under the RPC's pinned `search_path` |
| `0004_milestone2_crm.sql` | CRM extension tables, tenant-aware FKs/indexes, RLS, CRM RPCs, metrics, M1 hardening fixes |
| `0005_fix_crm_visibility.sql` | fix cross-tenant visibility of unassigned leads; already folded into `0004` |
| `supabase/seed.sql` | illustrative plan/entitlement reference data only |

---

## Validation

```bash
npm run typecheck   # TypeScript strict
npm test            # unit tests (permissions, formatters, CRM schemas/utils)
npm run lint        # oxlint
npm run build       # production build
```

### Tests actually executed

- `npm run typecheck` — passed.
- `npm test` — **21/21 passed** across 4 files.
- `npm run lint` — passed with warnings only (no errors).
- `npm run build` — passed; Vite warns that the JS chunk exceeds 500 kB.
- `supabase/tests/foundation_rls.sql` — executed in hosted SQL Editor; passed and rolled back.
- `supabase/tests/milestone2_crm.sql` — executed in hosted SQL Editor with the psql-only `\set` line removed: **37 checks, 37 passed, 0 failed**; transaction rolled back.
- Hosted schema probe after `0004`: 6 new CRM tables, 25 CRM policies, 6 key CRM functions and 4 extended contact columns.

### CRM UI smoke test

A temporary tenant (`M2 UI Smoke Clinic`), owner and employee, plus sample contacts, deals, activities, tags and custom fields were created with temporary SQL in the hosted project. The app was exercised in the in-app browser at its compact **912px** viewport (mobile drawer active), and all temporary fixtures were deleted afterwards.

Verified:

- Dashboard: real contact count and open deal value from `crm_dashboard_metrics`; links to Contacts and CRM overview.
- `/app/crm`: live counts, source/stage bars, recent activity, no console errors.
- `/app/contacts`: search/filter, 5 rows, detail modal, activity logging and tag attachment (POST to `contact_tags` returned 201).
- `/app/deals`: all 4 deals in correct stages; a card drag from **New enquiry** to **Appointment booked** succeeded via dnd-kit and updated the board.
- `/app/crm/settings`: owner/manager forms for pipelines, stages, sources, tags and custom fields; adding a lead source persisted and appeared in the list.
- Employee login: saw only 2 contacts (assigned + unassigned), claimed the unassigned lead successfully, saw only assigned deals, saw visibility-scoped CRM metrics, and received the manager-only CRM setup screen.

Cleanup result: `businesses=0`, `profiles=0`, `users=0`, `temp_admins=0`. Temporary `public/__m2_smoke_*` loader files were removed. No hardcoded tenant IDs or fake production numbers remain in the app.

---

## Remaining risks / before production

- Wide desktop breakpoints were checked in source/Tailwind classes and the M1 shell, but the in-app browser used for M2 smoke testing pins a 912px viewport; a separate wide-viewport visual pass is still worthwhile.
- Replace the hand-written `src/types/database.ts` with generated types now that the project exists (`npx supabase gen types typescript --project-id grkzontnyjnhijmphypo`).
- Add plan entitlement enforcement (server-side) before exposing billing.
- Add Storage bucket policies, webhook verification and idempotency when integrations are introduced.
- Add audit-log writes for all important future actions, not just provisioning/invitations/templates and the current CRM mutations.
- Review DPDP-related consent, retention, deletion and WhatsApp policy requirements before launch.
- Consider code-splitting the CRM routes; the production build reports one JS chunk over 500 kB.
- Pricing in `supabase/seed.sql` is illustrative and must be validated with real pilot customers.

---

## Next milestone

Milestone 3 has **not** been started. The next planned work is bookings/appointments and integrations, followed by workflows and campaigns. Do not begin it until Milestone 2 has been reviewed and accepted.
