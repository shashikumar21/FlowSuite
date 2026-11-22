# Growth — file-by-file implementation plan

Status: implemented locally. All code and the migration are **local only**;
nothing is applied to hosted or deployed. See [docs/GROWTH.md](GROWTH.md) for
the final module contract.

Scope: turn the four placeholder items in the **Growth** sidebar group into real
tenant-scoped modules — Marketing, Campaigns, Websites and Reputation.

Out of scope: hosted migrations, Edge Function deploys, WhatsApp/ads/email
providers, website hosting or custom domains, AI-generated replies, real review
fetching, real sends, invented delivery/engagement metrics, and any `VITE_*`
provider key.

## Inspection result

`src/app/config/navigation.ts` has four `planned(...)` entries under Growth, all
routing to `/app/module/<key>`. There are no Growth tables, RPCs or modules. The
Sales Agent already has `outreach_campaigns`; Growth campaigns are a separate
multi-channel planning record and must not reuse or alter that table.

## Database — one new file

`supabase/migrations/0021_growth_modules.sql` creates six new tables, each with:

- `tenant_id uuid not null references public.businesses(id) on delete cascade`;
- RLS `FOR SELECT TO authenticated USING (public.has_tenant_access(tenant_id))`;
- `REVOKE ALL FROM public, anon, authenticated` + `GRANT SELECT TO authenticated`;
- `unique (id, tenant_id)` where a child table references it;
- audit entries in the existing immutable `public.audit_logs`.

Tables:

| Table | Module | Purpose |
| --- | --- | --- |
| `growth_campaigns` | Campaigns | Multi-channel plan: name, channel, objective, status, dates, notes |
| `growth_creatives` | Marketing | Ad/broadcast copy attached to a campaign. No send action |
| `growth_websites` | Websites | Page records: slug, domain, status, notes. No hosting |
| `growth_form_submissions` | Websites | Manually recorded form leads with read/archived triage |
| `growth_reviews` | Reputation | Reviews with rating, status and a manual response |
| `growth_feedback` | Reputation | Feedback with rating and review status |

Every write goes through a `SECURITY DEFINER` RPC with `set search_path = ''`,
fully qualified `public.*` names and `has_tenant_access(p_tenant)` first.
Deletes require `public.can_manage_sales_agent(p_tenant)` (owner/admin). A
review response is stamped with `responded_by = auth.uid()` by the RPC, so a
client cannot claim someone else answered.

## Client module — `src/modules/growth/`

- `schemas.ts` / `utils.ts` — Zod form validation and honest labels.
- `types.ts`, `api.ts`, `hooks.ts` — tenant-scoped reads, RPC wrappers and
  react-query keys hung off `salesAgentKeys` for one-call invalidation.
- `pages/GrowthOverviewPage.tsx` — links plus real counts from the six tables.
- `pages/{MarketingPage,CampaignsPage,WebsitesPage,ReputationPage}.tsx`.
- `components/` — small modals per entity, built from existing UI primitives.
- `*.test.ts` — validation, tenant-scoped RPC arguments, rating bounds and
  the server-stamped review response.

## Wiring — modified

- `src/types/database.ts` — additive Growth row types, table entries and RPC types.
- `src/app/router/index.tsx` — five new `/app/growth/*` routes.
- `src/app/config/navigation.ts` — replace the four placeholders and add Overview.
- `README.md`, `docs/HOSTED_STATE.md` — record local-only Growth status.

## Verification

`npm run typecheck`, `npm test`, `npm run lint`, `npm run build`,
`git diff --check`, and browser smoke of all five routes plus the existing
Sales Agent pages. No hosted writes, no deploys, no sends and no invented
metrics.
