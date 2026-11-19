# FlowSuite — AI Business OS

One platform. Every business. Smarter growth.

FlowSuite is an original, India-first, multi-tenant SaaS business operating system inspired by the **feature categories** of Grexa.ai and GoHighLevel. One business = one tenant; each tenant can have multiple employees; super admins are a completely separate platform role.

This repository currently contains **Milestone 1 — the secure multi-tenant foundation**. CRM, booking, AI, workflow, marketing, billing and reporting modules are intentionally scaffolded as "planned" screens rather than fake implementations.

---

## What is implemented in Milestone 1

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
| RLS regression test script for cross-tenant attacks | Done (executed on the hosted project, transaction rolled back) |

**Explicitly not built yet:** CRM UI, drag-and-drop pipelines, booking pages, WhatsApp/AI integrations, workflow builder, campaigns, reputation, website builder, Razorpay billing, advanced analytics. See `src/app/config/navigation.ts` for the planned module map.

---

## Tech stack

- **Frontend:** React 19, TypeScript (strict), Vite 8, Tailwind CSS 4, React Router 7
- **Data/state:** TanStack Query 5, React Hook Form, Zod
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions)
- **Icons:** Lucide React
- **Testing:** Vitest + Testing Library, SQL-based RLS tests

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

For the hosted project already configured in `.env.local`, the SQL files were run in the dashboard SQL Editor in this order: `0001_core_foundation.sql`, `0002_business_configuration.sql`, `0003_fix_invitation_token.sql`, `supabase/seed.sql`.

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
  types/             hand-written Supabase Database type
supabase/
  migrations/        0001_core_foundation.sql, 0002_business_configuration.sql
  seed.sql           plans only — no fake businesses or contacts
  tests/             foundation_rls.sql
```

Regenerate types once a real project exists:

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

---

## Database and security model

- Every tenant-owned table has a non-null `tenant_id`.
- Composite foreign keys such as `(pipeline_id, tenant_id)` and `(contact_id, tenant_id)` prevent cross-tenant relationships.
- Money uses `numeric`, timestamps are UTC, display defaults to INR / Asia/Kolkata.
- RLS is enabled on every table; `platform_admins` has no client policies and all privileges revoked from `anon`/`authenticated`.
- Authorization helpers (`has_tenant_access`, `has_tenant_role`, `is_platform_admin`) are `security definer` with `search_path = ''`.
- Sensitive operations use trusted RPCs: `create_business`, `create_business_invitation`, `accept_business_invitation`, `apply_industry_template`, `admin_list_businesses`, `admin_list_plans`, `admin_platform_stats`.
- Triggers prevent self-promotion, owner-role changes by non-platform-admins, and removal of the last owner.
- Client-side `hasPermission()` only hides controls; the database remains authoritative.
- `audit_logs` is append-only from the client's perspective and readable only by tenant admins and platform admins.

### Migration sequence

| Migration | Contents |
| --- | --- |
| `0001_core_foundation.sql` | profiles, businesses, memberships, invitations, platform admins, plans, subscriptions, CRM core tables, audit log, helpers, RPCs, RLS, grants |
| `0002_business_configuration.sql` | business settings, branches, industry templates, template modules, tenant template settings, 10 India-focused industry templates |
| `0003_fix_invitation_token.sql` | hotfix: invitation tokens use built-in `gen_random_uuid()` instead of pgcrypto `gen_random_bytes()`, which is unavailable under the RPC's pinned `search_path` |
| Future `0004+` | services/bookings, integrations, campaigns, workflows, AI agents, invoices, reviews, websites, notifications — each with its own RLS |
| `supabase/seed.sql` | illustrative plan/entitlement reference data only |

---

## Validation

```bash
npm run typecheck   # TypeScript strict
npm test            # unit tests (permissions, formatters)
npm run lint        # oxlint
npm run build       # production build
```

RLS security regression tests (requires a running local Supabase database):

```bash
psql "$DATABASE_URL" -f supabase/tests/foundation_rls.sql
```

The same script was also run in the hosted project's SQL Editor with its single psql-only line (`\set ON_ERROR_STOP on`) removed. It passed with no errors and rolled back; follow-up counts confirmed zero test businesses, profiles and invitations were left behind.

The script covers: tenant read isolation, cross-tenant insert denial, email-bound invitation acceptance, self-promotion denial, platform-admin-only cross-tenant reads, and anonymous access denial. It runs in a single transaction and rolls back.

---

## Remaining risks / before production

- RLS tests pass on the hosted project, but two real sign-ups still need a manual end-to-end check (create two businesses and verify neither can see the other's data).
- Replace the hand-written `src/types/database.ts` with generated types now that the project exists (`npx supabase gen types typescript --project-id grkzontnyjnhijmphypo`).
- Add plan entitlement enforcement (server-side) before exposing billing.
- Add Storage bucket policies, webhook verification and idempotency when integrations are introduced.
- Add audit-log writes for all important future actions, not just provisioning/invitations/templates.
- Review DPDP-related consent, retention, deletion and WhatsApp policy requirements before launch.
- Pricing in `supabase/seed.sql` is illustrative and must be validated with real pilot customers.

---

## Next milestone

Build the CRM module on top of this foundation: contacts table, search/filters, assignment, deal pipelines with drag-and-drop, and activity history. Do not start it until the RLS script passes on a real database and two separate businesses have been tested against each other.
