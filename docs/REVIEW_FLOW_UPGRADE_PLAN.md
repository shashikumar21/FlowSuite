# Review Flow Upgrade — forward-only implementation plan

Date: 2026-11-24
Status: **MIGRATIONS APPLIED TO HOSTED — EDGE FUNCTION PENDING** (owner approved
all six design decisions on 2026-11-24 and explicitly approved applying
`0049`–`0054` on 2026-11-24 to restore the hosted CRM dashboard). No function
was deployed and no hosted setting, secret, auth config, message or payment was
changed. Local code was verified and committed separately from hosted rollout.

## 1. Goal

Replace the FlowSuite-hosted review page in Painter 4 with each tenant's own
Google review link, and add an **owner-side AI reply draft** workflow.

The reply must read naturally. It must not carry a public “AI-generated” badge.
It must not be silently published. An internal audit entry records that AI
assisted, and nobody should claim a human wrote it if asked directly.

## 2. Non-goals

- No Google Business Profile OAuth or automatic posting.
- No public “AI wrote this” label, and no deceptive concealment either.
- No change to the customer-facing `review-suggest` behaviour.
- No external WhatsApp/SMS/email send during implementation.
- No edits to migrations already applied on hosted.
- No hosted SQL, function deploy, commit or push without explicit approval.

## 3. Current state — evidence

| Area | Evidence |
| --- | --- |
| Review request schema | `supabase/migrations/0029_workflows_review_requests.sql:31-52` — `review_link_type` already allows `flowsuite`, `google`, `custom`; `review_url text` exists |
| Runner | `supabase/migrations/0035_fix_workflows_review_request_runner.sql:47-93` — reads `review_link_type`/`review_url` from the Painter 4 action config and inserts a `pending_approval` row |
| Sender | `supabase/functions/review-request-send-whatsapp/index.ts:33-35`, `:161-163` — uses `/r/{token}` only when type is `flowsuite`; otherwise uses `review_url` |
| Painter 4 config | `src/modules/workflows/pages/WorkflowsPage.tsx:100-109` — currently `review_link_type: 'flowsuite'`, `review_url: ''` |
| Approval UI | `src/modules/workflows/pages/WorkflowsPage.tsx:384-406` — Copy link / Approve / Cancel / Send WhatsApp |
| Business settings | `src/modules/settings/pages/BusinessSettingsPage.tsx:14-67` — direct `businesses` update, gated by `manage_business` |
| Customer-side AI suggestion | `supabase/functions/review-suggest/index.ts:1-82` — generates a **customer review draft** for 4–5 star feedback, not an owner reply; no external sends |
| Deployed function | `docs/HOSTED_STATE.md` — `review-suggest` is ACTIVE; `review-request-send-whatsapp` is ACTIVE |
| Not deployed | `docs/HOSTED_STATE.md` — `whatsapp-send`, `ai-follow-up-worker`, `telephony-webhook`, `sales-email-draft`, `notify-email` |

## 4. Proposed design

### 4.1 Per-tenant Google review URL

Add one optional field to `businesses`:

```sql
google_review_url text
```

Validation rules, enforced in a trusted RPC, not only in the UI:

- `null` or empty is allowed.
- Must start with `https://`.
- Host must be one of: `google.com`, `www.google.com`, `maps.google.com`,
  `maps.app.goo.gl`, `g.page`, `search.google.com`.
- Maximum 500 characters.
- No credentials, fragments or query parameters other than Google's own.

New RPC in a forward migration:

```sql
public.business_update_review_settings(
  p_tenant uuid,
  p_google_review_url text
)
```

- `SECURITY DEFINER`, `SET search_path = ''`.
- Requires `has_tenant_access(p_tenant)` and owner/admin role.
- Writes an audit row `business.review_settings_updated` with metadata-only
  `{ has_google_review_url: boolean }`. Never stores the URL in audit metadata.
- Grant `EXECUTE` only to `authenticated` after the internal role check.

UI change in `BusinessSettingsPage.tsx`:

- Add field **Google review link** with helper text: “Paste the official Write a
  review link from your Google Business Profile.”
- Save through `business_update_review_settings` instead of the direct table
  update for this field.
- Keep existing `manage_business` gate.

### 4.2 Painter 4 uses the Google link

Change only the template definition in `WorkflowsPage.tsx`:

```ts
{
  channel: 'whatsapp',
  delay_hours: '2',
  review_link_type: 'google',
  review_url: ''
}
```

The forward migration also upgrades existing workflows named exactly
`Painter - 4. Google Review Request` that still use a blank FlowSuite config.
Renamed or custom workflows are left untouched.

Forward migration replaces `workflows_handle_appointment_completed()` with an
additional resolution step:

```text
if review_link_type = 'google' and config review_url is blank:
    use businesses.google_review_url for the tenant
if still blank:
    fall back to 'flowsuite' and write audit
    review_request.google_link_missing
```

This keeps the flow safe if a tenant has not configured a Google link yet.

If a tenant intentionally sets a custom URL in the action config, that value
still wins. The sender function needs no change because it already prefers
`review_url` for non-`flowsuite` link types.

### 4.3 Owner-side AI reply draft

This is a new capability. It does not replace `review-suggest`.

Because customers now go straight to Google, they will not normally submit a
FlowSuite rating. Staff therefore record the published rating and review text
in the review card first via `review_reply_set_source`. The safe UI list RPC
includes `customer_feedback` so previously entered text can be edited. No
Google OAuth or scraping is used in this milestone.

Add to `review_requests` in the same forward migration:

```sql
owner_reply_draft text,
owner_reply_status text not null default 'not_requested'
  check (owner_reply_status in
    ('not_requested','generated','fallback','approved','rejected','copied')),
owner_reply_approved_by uuid references public.profiles(id) on delete set null,
owner_reply_approved_at timestamptz,
owner_reply_copied_at timestamptz
```

New trusted RPCs:

| RPC | Purpose | Authorization |
| --- | --- | --- |
| `review_reply_context(p_tenant, p_request)` | Return tenant/business name, rating and sanitised feedback for drafting | tenant access + owner/admin/manager |
| `review_reply_set_source(p_tenant, p_request, p_rating, p_feedback)` | Record published Google rating/review text | tenant access + owner/admin/manager |
| `review_reply_save_draft(p_tenant, p_request, p_draft, p_status)` | Store draft with length check | service role only |
| `review_reply_set_status(p_tenant, p_request, p_status)` | Approve / reject / copied | tenant access + owner/admin/manager |
| `review_requests_list_for_ui(p_tenant)` | Safe list for the review card | tenant access; draft columns omitted |

Direct `SELECT` on `review_requests` is revoked from `authenticated`. The trusted
list RPC returns only card fields, so the AI draft cannot be read by any tenant
member through the existing table query path.

New Edge Function `review-reply-suggest`:

- Reads the caller JWT, verifies the user and tenant through
  `review_reply_context`.
- Uses the existing `createAiProvider` adapter from
  `supabase/functions/_shared/ai/provider.ts`.
- Writes the draft through `review_reply_save_draft` using a service client.
- Never returns another tenant's data.
- Writes audit `review_reply.generated` with metadata
  `{ ai_assisted: true, status }` only. No phone, email or full review text.

Draft prompt rules:

```text
Write a short, natural, specific business reply to a customer review.
1-3 sentences, max 600 characters.
Use only the supplied rating and feedback.
No fake facts, no invented staff names, no medical claims, no guarantees.
Do not add an AI label.
Do not claim that a human wrote it.
If the customer asks who wrote it later, the business must answer honestly.
```

No auto-post. The UI offers **Approve**, **Reject**, and **Copy**. The owner or
staff member pastes the approved text into Google Business Profile manually.

### 4.4 UI changes

In `WorkflowsPage.tsx` review request card:

- Show `review_link_type` and, for Google, the configured domain only, not the
  full URL.
- Add button **Edit review details** so staff can record or correct the
  published Google rating/review text.
- Add button **Draft AI reply** for `pending_approval`, `approved` or `sent`
  requests that have a rating.
- Show the returned draft in a read-only textarea with Approve / Reject / Copy.
- Copy writes `review_reply.copied` audit and changes status to `copied`.
- Keep the existing human approval gate for the WhatsApp review request.

In `ReviewsPage`/audit list, extend the action allowlist with:

- `review_reply.generated`
- `review_reply.approved`
- `review_reply.rejected`
- `review_reply.copied`
- `review_request.google_link_missing`

### 4.5 Privacy and honesty rules

- Replies sound natural, but the internal audit records AI assistance.
- Do not tell a customer a human wrote the reply if they ask.
- No patient, clinical or medical-history content may enter the prompt.
- Drafts are tenant-scoped and owner/admin/manager only.
- Audit metadata stays metadata-only.
- No public endpoint exposes `owner_reply_draft`.

## 5. Files expected to change during implementation

| File | Change |
| --- | --- |
| `supabase/migrations/0049_review_flow_upgrade.sql` | New forward migration; column, RPCs, runner replacement, grants, audit |
| `src/modules/settings/pages/BusinessSettingsPage.tsx` | Google review link field + RPC save |
| `src/modules/workflows/pages/WorkflowsPage.tsx` | Painter 4 config, AI reply UI, link display |
| `src/modules/reviews/api.ts` | Review-settings, source, list and AI-reply API calls; audit actions |
| `src/modules/reviews/validation.ts` | Client-side Google URL validation and host-only display |
| `src/app/providers/TenantProvider.tsx` | Load `google_review_url` with the tenant business summary |
| `src/types/database.ts` | Add `google_review_url` to the app business row contract |
| `supabase/functions/review-reply-suggest/index.ts` | New Edge Function |
| `supabase/functions/_shared/ai/provider.ts` | Reused, no expected change |
| `supabase/tests/review_flow_upgrade.sql` | New RLS/role/validation tests |
| `docs/HOSTED_STATE.md` | Record new migration and deployed function after approval |

## 6. Verification plan

Local commands to run after implementation:

| Command | Expected |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | Pass, including new tests |
| `npm run lint` | No new warnings |
| `npm run build` | Pass |
| `git diff --check` | Pass; only CRLF warnings |
| SQL test file | Rolled-back transaction, all assertions pass |

Manual browser checks in demo tenant only:

1. Save a valid Google review URL in Business Settings; invalid URL is rejected.
2. Add Painter 4, set active, complete an appointment.
3. Review request shows `google` link type; no external send occurs.
4. Approve request; the link used is the tenant Google URL.
5. Generate AI reply; approve and copy; audit shows `ai_assisted: true`.
6. Confirm no other tenant can read the draft or the setting.

No real WhatsApp send, no real Google post and no patient data during tests.

## 7. Deployment requirements — status

1. Forward migrations `0049`–`0054` were approved and applied to hosted in order
   on 2026-11-24. They must never be edited after application.
2. Deployment of `review-reply-suggest` is still pending explicit approval.
3. Confirm the AI provider secrets already used by `ai-chat` may be reused.
   Only secret names may be discussed; values must never be pasted in chat.
4. Provide the official Google review link through the tenant UI, not chat.
5. Any real WhatsApp send still requires separate approval now that the
   migrations are live.
6. Google posting stays manual for this milestone.

## 8. Owner decisions

All six design decisions were approved on 2026-11-24:

| # | Decision | Outcome |
| --- | --- | --- |
| 1 | Add `google_review_url` to `businesses` | Approved |
| 2 | Replace appointment-completed runner with Google fallback logic | Approved |
| 3 | Add owner-side AI reply draft | Approved |
| 4 | Keep human approval before copy/post | Approved — no auto-post |
| 5 | Show no public AI badge, keep internal AI audit | Approved |
| 6 | Fall back to FlowSuite link when Google URL is missing | Approved |

## 9. Rollback posture

- All database changes are additive or forward function replacements in a new
  migration. Applied migrations are never edited.
- If the upgrade must be undone, create a new forward migration to revert the
  template default and hide the new UI. Do not delete or edit `0049`.
- Edge Function rollback means redeploying the previous approved bundle, only
  with explicit approval.

## 10. Current status

Local code and migration files are complete under the approved design and were
checked after local Docker/Supabase and Deno became available:

| Check | Result |
| --- | --- |
| `0049`–`0054` applied locally with `supabase migration up` | Pass |
| `0049`–`0054` applied to hosted with explicit approval | Pass; CRM dashboard restored |
| `supabase/tests/review_flow_upgrade.sql` | Pass; rolled back; includes copy-before-approval denial |
| Other 13 local SQL test files | Pass; all rolled back |
| `deno check` on all Edge Functions, including `review-reply-suggest` | Pass |
| `npm test` | Pass — 60 files, 426 tests, including prompt-screening tests |
| `npm run typecheck`, `npm run lint`, `npm run build` | Pass; lint warnings only |
| `git diff --check` | Pass; only CRLF line-ending warnings |

A final independent audit found no secrets, RLS regressions or patient-data
exposure. Its four findings were fixed locally: server-side approval before
copy, rejection state handling, prompt screening for contact/clinical text and
AI usage logging for the new function.

The migrations are now applied to hosted. Hosted object-level checks confirmed
`google_review_url`, the five `owner_reply_*` columns and the review-flow RPCs;
data counts were unchanged and `/app` plus `/app/crm` loaded with no console
errors. The Edge Function is not deployed and no hosted setting was saved.
Local code was committed and pushed separately from hosted rollout. Verification
results are reported in `docs/MILESTONE_0_REPORT.md`.
