# Growth modules — local only

The four former Growth placeholders are now real, tenant-scoped modules:

| Route | What it does | What it deliberately does not do |
| --- | --- | --- |
| `/app/growth` | Shows counts derived from the six saved tables and links to each module | No reach, spend, open, click or conversion metric |
| `/app/growth/marketing` | Stores campaign copy with channel, headline, message and CTA | No WhatsApp/SMS/ads/social provider and no send action |
| `/app/growth/campaigns` | Stores multi-channel plans, dates, status and real creative counts | No email campaign reuse and no delivery reporting |
| `/app/growth/websites` | Stores page records and manually entered form submissions | No hosting, DNS, custom domain or live form |
| `/app/growth/reputation` | Stores reviews, responses and direct feedback | No review fetching, AI-generated replies or posting back |

## Security contract

- Migration `0021_growth_modules.sql` is **local only**. It has not been applied
  to the hosted project and no earlier migration was edited.
- Six new tables (`growth_campaigns`, `growth_creatives`, `growth_websites`,
  `growth_form_submissions`, `growth_reviews`, `growth_feedback`) have RLS
  `SELECT` only for active tenant members.
- Every write uses a `SECURITY DEFINER` RPC that checks
  `public.has_tenant_access(p_tenant)` first and writes an `audit_logs` entry.
- Deletes additionally require `public.can_manage_sales_agent(p_tenant)`.
  The owner/admin check in the UI is only a convenience.
- `growth_update_review` stamps `responded_by = auth.uid()` itself. The browser
  never sends a responder identity.
- All client form input is validated with Zod before an RPC call; the SQL
  constraints remain the authoritative enforcement point.
- No API key, provider name, `VITE_*` secret, send queue or webhook was added.

## Files

- `supabase/migrations/0021_growth_modules.sql` — tables, RLS, grants and 18 RPCs.
- `src/types/database.ts` — additive row, table and RPC types.
- `src/modules/growth/` — schemas, API, hooks, utils, components, pages and tests.
- `src/app/router/index.tsx` and `src/app/config/navigation.ts` — five routes
  and real sidebar links.

## Local checks

```powershell
npm run typecheck
npm test -- --run
npm run lint
npm run build
git diff --check
```

Because no local Postgres is available on this machine, the migration has not
been executed. Do not promote `0021` to hosted without an explicit owner
approval and a fresh backup.
