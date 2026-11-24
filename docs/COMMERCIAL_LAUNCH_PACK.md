# FlowSuite commercial launch pack

Date: 2026-11-24
Status: planning document; no external publication or sales commitment is made
by this file.

## 1. Best route to market

Sell FlowSuite as a **hosted multi-tenant SaaS subscription**, not as source code.

One platform serves many tenants. Each business gets its own isolated data,
users, bookings, invoices, workflows and settings. Industry differences are
handled with **industry packs**, not separate apps.

Canonical brand/domain from project instructions: **FlowSuite — flow-suit.com**.
Confirm the live production origin before publishing links.

### Why SaaS subscription wins

| Model | Verdict | Reason |
| --- | --- | --- |
| Hosted SaaS subscription | Best | Recurring revenue, one codebase, security and updates stay under control |
| White-label/reseller | Later | Needs custom domains, branding, billing and a support model |
| Source-code licence | Avoid | Forks, secrets, maintenance burden and no clean upgrade path |

## 2. Positioning

> FlowSuite is a CRM, booking, billing, workflow and AI workspace for growing
> Indian businesses. Dental clinics get a specialist patient-care pack on the
> same platform.

Sell the horizontal core to all businesses, then upsell vertical depth.

### Target segments

1. **General local businesses** — salons, gyms, coaches, consultants, home
   services, agencies.
2. **Clinics without patient records** — appointment-led clinics that only need
   CRM, bookings, reminders and billing.
3. **Dental clinics** — the premium vertical with patient records, documents
   and consented medical history.
4. **Multi-location businesses** — custom/enterprise once the basics are proven.

## 3. Product packages

### FlowSuite Core

For: general businesses.

Include:

- CRM: contacts, leads, pipelines, activities, import/export
- Booking: appointments, services, staff/resources, public booking page
- Billing: invoices, GST fields, manual payment status
- Workflows and review requests
- Reports and AI chat
- Team roles and tasks

Exclude patient records and medical history.

### FlowSuite Clinic

For: clinics that do not need clinical records.

Include Core plus:

- Clinic-style contact fields
- Appointment reminders and review requests
- Doctor/staff booking views
- Tenant-owned Razorpay/UPI collection
- Communication templates

Exclude medical history and patient documents.

### FlowSuite Dental Pro

For: dental clinics after Milestone 0 safety closure.

Include Clinic plus:

- Patient records
- Private patient documents
- Consent-based medical history timeline
- Doctor/admin-only access
- Metadata-only audit log
- Dental workflows and recall reminders

This is premium and privacy-sensitive. Do not expose it in WhatsApp, email,
Google or public booking pages.

## 4. Feature matrix

| Capability | Core | Clinic | Dental Pro |
| --- | ---: | ---: | ---: |
| Contacts / Leads / Pipeline | Yes | Yes | Yes |
| Appointments / Public booking | Yes | Yes | Yes |
| Invoices / GST / Razorpay | Yes | Yes | Yes |
| Workflows / Review requests | Yes | Yes | Yes |
| Reports / AI assistant | Yes | Yes | Yes |
| Clinic required contact fields | Template | Yes | Yes |
| Patient documents | No | No | Yes |
| Medical history with consent | No | No | Yes |
| Doctor-only clinical access | No | No | Yes |

## 5. Suggested pricing

These are launch recommendations, not locked prices. Validate with pilot
customers and get the owner's approval before publishing.

| Plan | Monthly | Annual | Best for |
| --- | ---: | ---: | --- |
| Starter | ₹999 | ₹9,990 | Small businesses, core CRM + booking |
| Growth | ₹2,499 | ₹24,990 | Businesses using AI, workflows and reports |
| Clinic | ₹3,999 | ₹39,990 | Appointment-led clinics |
| Dental Pro | ₹4,999 | ₹49,990 | Dental clinics using patient modules |
| Enterprise | Custom | Custom | Multi-location / multi-team |

Optional:

- Setup and migration fee: ₹2,999–₹9,999
- Extra AI credits as an add-on
- Extra storage/integrations as add-ons
- Annual billing gives roughly two months free

Avoid lifetime deals and unlimited-use promises.

## 6. Founding-customer offer

Recommended for the first 10 paying customers:

> 30% off the first annual subscription in exchange for a 30-minute feedback
> call and permission to use an anonymised case study.

Rules:

- Use the demo tenant only for demonstrations.
- Never use real patient data in sales material.
- Do not promise a feature that is not production-verified.
- Do not configure or send real WhatsApp/email campaigns during a sales demo.

## 7. Demo flow (30–45 minutes)

1. **Discovery — 5 minutes**
   - What business do you run?
   - How do you currently handle enquiries, appointments and invoices?
   - How many staff and customers?
   - Do you need patient records, or only appointments/billing?

2. **Fit the pack — 2 minutes**
   - Choose Core, Clinic or Dental Pro.

3. **Live walkthrough — 15 minutes**
   - Contacts and lead capture
   - Booking calendar and public booking page
   - Invoice and payment flow
   - Workflows/review request
   - Reports
   - AI assistant with human review

4. **Vertical highlight — 5 minutes**
   - General business: lead → booking → invoice.
   - Clinic: appointment → reminder → review request.
   - Dental Pro: patient record → document → consented history → audit trail.

5. **Commercials — 5 minutes**
   - Plan, setup fee, annual discount, trial.

6. **Next step — 3 minutes**
   - 14-day trial, onboarding call, contact import.

## 8. Onboarding checklist

### Before onboarding

- Confirm tenant identity and owner email.
- Confirm chosen pack and plan.
- Confirm production origin and invite link.
- Do not use the owner tenant for demos.

### Day 0

- Create tenant and owner account.
- Set business profile, currency INR, timezone Asia/Kolkata.
- Invite staff and assign roles.
- Configure services, staff/resources and booking hours.
- Configure invoice template and GST details.
- Owner saves their own Razorpay keys; never collect or paste keys in chat.

### Day 1

- Import contacts using the CSV template.
- Verify clinic/general required-field rules.
- Create first booking.
- Create first draft invoice.
- Configure one simple workflow.
- Confirm no clinical detail appears in WhatsApp/email/public pages.

### Week 1

- Review reports.
- Review audit log for sensitive actions.
- Confirm backup/restore and support process internally.
- Ask for feedback and testimonial permission.

## 9. Legal and compliance checklist

Before public selling, obtain proper advice and put these in place:

- Terms of Service
- Privacy Policy
- Refund/cancellation policy
- Service-level expectations and support hours
- GST-compliant invoicing and tax details
- DPDP consent, retention, deletion and grievance process
- Clinic/patient data processing terms for Dental Pro
- Clear statement that AI provides suggestions, not medical diagnosis

Do not claim HIPAA compliance. India-first positioning should reference DPDP,
not US healthcare law.

## 10. Claims to use and avoid

### Use

- Tenant-scoped data with RLS
- Role-based access
- Owner-controlled payment keys
- Metadata-only audit logs for sensitive actions
- AI suggestions with human review
- Privacy-first patient records

### Avoid

- HIPAA compliant
- AI diagnoses patients
- Guaranteed leads or revenue
- Unlimited WhatsApp
- Fully automated patient communication
- 100% secure / unbreakable
- Any feature not verified in `docs/HOSTED_STATE.md`

## 11. Launch gates from Milestone 0

Do not publicly sell as "production-ready" until:

1. Backup and restore drill is completed.
2. Canonical production origin is confirmed.
3. `support` vs `super_admin` policy is decided.
4. Report-role enforcement decision is made.
5. Service-only RPC ACL hardening decision is made.
6. Razorpay keys, webhook and test payment are configured by the owner.
7. Legal/commercial documents are approved.
8. Commit, push and deployment approvals are given.

Until then, it is acceptable to collect design-partner interest and run controlled
demos, but not to promise a fully hardened production service.

## 12. 90-day execution plan

### Days 1–14 — Close the safety gate

- Close Milestone 0 decisions above.
- Complete backup/restore drill.
- Publish approved pricing and legal pages.
- Prepare demo tenant, demo script and CSV import template.

### Days 15–30 — Founding customers

- Approach 20 targeted businesses.
- Run 10 demos.
- Convert 5–10 design partners.
- Do hands-on onboarding for each.

### Days 31–60 — Stabilise

- Weekly support review.
- Fix only high-impact issues.
- Build repeatable onboarding checklists per industry pack.
- Collect anonymised case studies.

### Days 61–90 — Scale

- Convert design partners to annual plans.
- Publish 3 case studies.
- Add one high-demand integration or workflow pack.
- Consider white-label/reseller only after core retention is proven.

## 13. Metrics to track

| Metric | Why |
| --- | --- |
| Demo → trial conversion | Sales-message quality |
| Trial → paid conversion | Product value and onboarding quality |
| Time to first booking | Onboarding friction |
| Time to first invoice | Billing activation |
| Weekly active tenants | Real usage, not signups |
| Support tickets per tenant | Reliability and clarity |
| Retention at 30/60/90 days | Whether the product is genuinely useful |
| AI suggestion acceptance rate | Whether AI helps without overstepping |

## 14. Next decision

The recommended next action is:

1. Close Milestone 0.
2. Approve pricing and legal documents.
3. Run the 10-customer founding offer.
4. Expand industry packs only after the first cohort gives evidence.

This keeps the platform broad enough for all businesses while avoiding a
premature, risky launch.
