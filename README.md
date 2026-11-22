# FlowSuite — AI Business OS

One platform. Every business. Smarter growth.

FlowSuite is an original, India-first, multi-tenant SaaS business operating system inspired by the **feature categories** of Grexa.ai and GoHighLevel. One business = one tenant; each tenant can have multiple employees; super admins are a completely separate platform role.

This repository contains **Milestone 1 — secure multi-tenant foundation**, **Milestone 2 — core CRM** and **Milestone 3 — booking system + communication foundation**. AI, workflow, marketing, website, billing and advanced reporting modules remain intentionally planned screens rather than fake implementations.

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
| Contact/lead import from `.xlsx`, `.xls` and `.csv` (5 MB / 5,000 rows) | Done |
| Upload → worksheet select → column/custom-field mapping → duplicates → preview → batches → summary | Done |
| Duplicate strategies: skip, update, import-as-new (with explicit confirmation) | Done |
| Per-row validation, server-side revalidation, error report CSV, import history | Done |
| Filtered CSV export with formula-injection protection and visibility-scoped rows | Done |
| Sample Excel template download, manager-only import controls | Done |
| Import/export security + workflow regression suite (33 checks) | Done (executed on hosted project, rolled back) |
| Lead enrichment fields (Clinic, Area, Mobile (+91), Rating, Reviews, Why included, Google Maps link, Sent?, Reply 1) in contact form, detail, list and CSV export | Done |
| Import mapping for all nine enrichment headers, with +91 mobile and Y/N normalisation | Done |
| Lead enrichment regression suite (17 checks) | Done (executed on hosted project, rolled back) |

### Milestone 3 — booking & communication foundation

| Area | Status |
| --- | --- |
| Services, booking resources, service→resource links | Done |
| Weekly availability rules, date ranges and exceptions (blocked/available/break) | Done |
| Server-side slot engine in the business timezone (rules, breaks, lead time, live appointments) | Done |
| Anonymous, slug-scoped booking page at `/book/:slug` — services, slots, customer details, confirmation | Done |
| Token-scoped customer self-service (reschedule/cancel) with policy checks | Done |
| Staff appointment creation, rescheduling, status history and assignment via trusted RPCs | Done |
| GiST exclusion constraint preventing overlapping appointments on every write path | Done |
| Booking page settings (branding, horizon, lead time, slot interval, required fields, policies) | Done |
| Real booking overview metrics from `booking_dashboard_metrics` (no mock numbers) | Done |
| Inbox conversations/messages with assignment, status, internal notes and read state | Done |
| In-app notifications with bell, unread count, mark-read and list screen | Done |
| Server-only email adapter seam (`notify-email` Edge Function), no keys in the browser | Foundation only |
| Booking/inbox regression suite (38 checks) | Done (executed on hosted project, rolled back) |

### Native AI Sales Agent — Phase 2 foundation

| Area | Status |
| --- | --- |
| Tenant-scoped prospects, saved manual searches, decision-maker/verification/import schema | Done (migrations `0017` + `0018`, hosted and local) |
| Overview with real counts from `sales_dashboard_metrics` — no invented scores or demo data | Done |
| Add/edit/delete prospects, lead status changes, server-authoritative duplicate checks | Done |
| CSV/XLSX prospect import reusing the CRM parser, with per-row results | Done |
| Prospect → CRM contact conversion (`0018`, idempotent, reuses email matches, audited) | Done |
| Explicit provider status: discovery/verification/email sending unavailable until configured | Done |
| `NEW` sidebar group with Overview, Prospect discovery and Prospects enabled | Done |
| Phase 3/4 (AI email writing, campaigns, approvals, replies) | Deferred — schema only, no sending |

Migrations `0015`–`0018` were applied to the hosted project in order; no Sales Agent Edge Function is needed (all writes are database RPCs). The separate website chat Edge Function is deployed. See [docs/AI_SALES_AGENT.md](docs/AI_SALES_AGENT.md) for setup, security model and next steps.

**Still not built:** WhatsApp/AI live integrations, workflow builder, marketing campaigns, reputation, website builder, Razorpay billing and advanced analytics. Automated email dispatch is intentionally deferred. See `src/app/config/navigation.ts` for the planned module map.

---

## Tech stack

- **Frontend:** React 19, TypeScript (strict), Vite 8, Tailwind CSS 4, React Router 7
- **Data/state:** TanStack Query 5, React Hook Form, Zod
- **CRM board:** `@dnd-kit/core`, `@dnd-kit/sortable`
- **Spreadsheet import:** SheetJS Community Edition `xlsx@0.20.3` (vendored tarball)
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
7. `0006_contact_import_export.sql`
8. `0007_fix_import_idempotency.sql`
9. `0008_confirmed_duplicate_imports.sql`
10. `0009_fix_import_tag_cast.sql`
11. `0010_milestone3_booking_communication.sql`
12. `0011_fix_booking_notifications.sql`
13. `0012_prevent_appointment_overlaps.sql`
14. `0013_crm_lead_enrichment.sql`
15. `0015`–`0016` (hosted prerequisite fixes)
16. `0017_ai_sales_agent.sql` (hosted variant fixed first; see commit `ccddd6c`)
17. `0018_sales_prospect_contact_conversion.sql`

`0004` already contains the `0005` visibility fix for fresh installs; `0005` exists so an already-migrated database can be patched on its own. `0007`–`0009` are hotfixes that replace earlier import definitions. `0010` already contains the `0011` and `0012` fixes for fresh installs; `0011` only replaces three RPCs and `0012` adds one exclusion constraint on databases that already ran `0010`. Fresh installs must apply the whole sequence in order. There is no `supabase/config.toml`, so hosted migrations were applied manually (via `supabase db query --remote`, never `db push`, because the hosted migration history table was empty).

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

After signing in, the AI console is under **Automation → AI Agents / AI Conversations** and **Settings → Integrations**. See [docs/AI_CONSOLE_UI.md](docs/AI_CONSOLE_UI.md) for what works and what still needs deployment. The native Sales Agent is under **AI Sales Agent NEW → Overview / Prospect discovery / Prospects** and requires migration `0017` to be applied to the backend before its screens can load data.

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
      data-exchange/   CSV/XLSX parsing, mapping, validation, import/export API
    ai/              server-only provider, safety, tools, usage and tests
    ai-console/      browser UI for agents, integrations and AI conversations
  types/             hand-written Supabase Database type
supabase/
  migrations/        0001–0016
  seed.sql           plans only — no fake businesses or contacts
  tests/             foundation_rls.sql, milestone2_crm.sql, contact_import_export.sql, milestone3_booking.sql, crm_lead_enrichment.sql
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
| `0006_contact_import_export.sql` | import jobs/batches, duplicate preview, batched writes, filtered CSV export, audit |
| `0007_fix_import_idempotency.sql` | only open import jobs participate in re-upload idempotency |
| `0008_confirmed_duplicate_imports.sql` | `contacts.import_allow_duplicate` allows explicit import-as-new |
| `0009_fix_import_tag_cast.sql` | fix tagged-row import by casting the JSON text value to `uuid` |
| `0010_milestone3_booking_communication.sql` | services/resources/availability/booking pages, appointment events, channels/webhooks/notifications, slot engine, staff and public booking RPCs, inbox/notification RPCs, RLS and grants |
| `0011_fix_booking_notifications.sql` | fix anonymous-booking notifications, legacy `conversations.channel`, and channel-less conversation messages (folded into `0010`) |
| `0012_prevent_appointment_overlaps.sql` | add a GiST exclusion constraint so overlapping appointments are impossible on every write path (folded into `0010`) |
| `0013_crm_lead_enrichment.sql` | nine nullable/defaulted lead columns on `contacts`, enriched create/update/search/export/import RPCs, mobile normalisation and rating/reviews checks |
| `0014_milestone4_ai_communication.sql` | website/WhatsApp AI agents, knowledge, tools, consent, conversations, follow-ups, RLS and trusted RPCs |
| `0015_milestone4_ai_service_rpcs.sql` | service-role-only AI provider RPCs (no schema changes) |
| `0016_milestone4_ai_qualification_rpcs.sql` | service-role-only assessment and follow-up enqueue RPCs (no schema changes) |
| `0017_ai_sales_agent.sql` | native Sales Agent prospects/searches/verification/import schema, suppression, metrics RPCs, RLS, grants and audit — local only |
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
- `npm test` — **87/87 passed** across 12 files.
- `npm run lint` — passed with warnings only (no errors).
- `npm run build` — passed; Vite warns that the JS chunk exceeds 500 kB.
- `supabase/tests/foundation_rls.sql` — executed in hosted SQL Editor; passed and rolled back.
- `supabase/tests/milestone2_crm.sql` — executed in hosted SQL Editor with the psql-only `\set` line removed: **37 checks, 37 passed, 0 failed**; transaction rolled back.
- `supabase/tests/contact_import_export.sql` — executed in hosted SQL Editor: **33 checks, 33 passed, 0 failed**, including a tagged-row regression case; transaction rolled back.
- `supabase/tests/milestone3_booking.sql` — executed in hosted SQL Editor: **38 checks, 38 passed, 0 failed**, covering anonymous slot lookup/booking/idempotency/overlap/token self-service, staff transitions, the database-level overlap constraint, cross-tenant denial, inbox and notification scoping; transaction rolled back.
- `supabase/tests/crm_lead_enrichment.sql` — executed in hosted SQL Editor: **17 checks, 17 passed, 0 failed**, covering create/update round-trips, search and export of all nine lead fields, rating/reviews CHECKs, import parsing/normalisation (`+91` mobile, `Y/N` sent) and cross-tenant denial; transaction rolled back.
- Hosted schema probe after `0004`: 6 new CRM tables, 25 CRM policies, 6 key CRM functions and 4 extended contact columns.
- Hosted schema probe after `0010`: 11 new tables, 10 key functions and 16 sampled RLS policies.

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

### Import/export UI smoke test

A second temporary tenant (`m2-import-smoke`) with owner, manager and employee accounts was used to exercise the import/export flow through the real app against migrations `0006`–`0009`:

- Re-importing a previously failed 2-row CSV after `0009`: **2 created, 0 failed**, with `VIP` on Asha Sharma and `VIP` + `Follow-up` on Ravi Verma.
- Filtered CSV export (manager-owned filter) contained only the matching contact row.
- Sample Excel template downloaded as `flowsuite-import-template.xlsx`.
- Import History showed both the successful `2 / 2` job and the earlier failed `2 / 2` job with its downloadable error report (`Could not import this row (22P02)`).
- Employee login: Import buttons disabled with `Only managers can import records`, History hidden, and CSV export containing only the header.

Temporary SQL loader files and the smoke CSV under `public/` were removed. The smoke tenant and its three users were subsequently deleted from the hosted database (final counts: businesses=0, users=0, profiles=0).

---

## Remaining risks / before production

- Wide desktop breakpoints were checked in source/Tailwind classes and the M1 shell, but the in-app browser used for smoke testing pins a 912px viewport; a separate wide-viewport visual pass is still worthwhile.
- Replace the hand-written `src/types/database.ts` with generated types now that the project exists (`npx supabase gen types typescript --project-id grkzontnyjnhijmphypo`).
- Add plan entitlement enforcement (server-side) before exposing billing.
- Add Storage bucket policies, webhook verification and idempotency when integrations are introduced.
- Add audit-log writes for all important future actions, not just provisioning/invitations/templates and the current CRM mutations.
- Review DPDP-related consent, retention, deletion and WhatsApp policy requirements before launch.
- Consider code-splitting the app routes; the production build reports one JS chunk over 500 kB.
- Pricing in `supabase/seed.sql` is illustrative and must be validated with real pilot customers.
- SheetJS CE is vendored at `xlsx@0.20.3`, the patched release for the older prototype-pollution/ReDoS advisories. It is not distributed on npm, so `npm audit` does not scan it; re-check upstream advisories before upgrading and keep the vendored SHA256 pinned.
- Import size limits (5 MB / 5,000 rows) are enforced server-side; the wizard's checks are UX only. Large sheets are parsed on the main thread before upload, so a Web Worker is worth considering for heavier files.

---

## Next milestone

Milestone 3 and the deferred CRM lead-enrichment follow-up are complete and committed. The next milestone is AI/WhatsApp automation, followed by workflows and campaigns.
