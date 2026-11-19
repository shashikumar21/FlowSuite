# AI Business OS — Project Instructions

## Product Vision
Build a multi-tenant AI-powered SaaS business operating system for local businesses in India.
Brand: FlowSuite | Domain: flow-suit.com

Product inspiration:
- Grexa.ai (AI marketing, local business focus)
- GoHighLevel (CRM, automation, funnels)

Do not copy their branding, proprietary code, design assets, or protected content.
Build an original product and experience.

## Technology
Frontend:
- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- React Router v6
- TanStack Query v5
- React Hook Form + Zod
- Recharts for analytics
- @dnd-kit for drag-and-drop (pipelines)
- date-fns for date handling
- Lucide React for icons

Backend:
- Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions)
- Supabase Queues + Cron for background jobs

## Architecture
Use a modular monolith. One business = one tenant. One tenant can have multiple employees.
All tenant-owned database records must contain tenant_id.
Enforce tenant isolation through PostgreSQL RLS.
Never rely exclusively on frontend filtering.

## User Roles
- **Super Admin**: Platform owner, manages all businesses and subscriptions
- **Business Owner**: Tenant admin, controls their individual business
- **Business Admin**: Senior team member with management permissions
- **Manager**: Team lead with limited admin capabilities
- **Employee**: Regular team member, works within assigned scope

Implement permission checks at both database and trusted server layers.

## Module Architecture (12 Modules, 4 Areas)

### A. Acquire — Get more customers
1. CRM (leads, contacts, pipelines, scoring)
2. Website & Funnel Builder
3. Marketing Suite (WhatsApp, email, campaigns)
4. Reputation Management (reviews, AI replies)

### B. Convert — Turn enquiries into customers
5. Omnichannel Inbox (WhatsApp, web chat, email)
6. Booking Engine (calendars, services, reminders)
7. AI Agents (chatbots, lead qualification)

### C. Operate — Manage the business
8. Automation Engine (triggers, conditions, actions)
9. Team Management (roles, tasks, permissions)
10. Billing & Payments (Razorpay, invoices)

### D. Grow — Understand and improve
11. Analytics (revenue, conversion, retention)
12. AI Business Manager (natural language insights)

## Development Rules
1. TypeScript strict mode.
2. Reusable components in src/components/.
3. Feature-based folder structure in src/modules/.
4. Separate UI and business logic.
5. Zod validation for all form inputs and API responses.
6. No hardcoded tenant IDs.
7. No hardcoded subscription limits.
8. No secrets in frontend code (no VITE_ for service keys).
9. Use migrations for all database changes.
10. Add RLS tests for tenant-owned tables.
11. Add loading, error, and empty states for all data views.
12. Add audit logs for important actions.
13. Use UTC for database timestamps.
14. Respect tenant timezone when displaying dates.
15. Use database constraints for data integrity.
16. Use numeric/decimal for money, never float.

## Multi-Tenant Security
- Every tenant-owned query must be scoped through authenticated tenant membership.
- Every insert and update must validate tenant ownership.
- Employees must only access permitted records.
- Business owners must not be able to change platform administrator permissions.
- Use server-side authorization for sensitive operations and integrations.
- Cross-tenant access must be impossible through RLS.

## AI Rules
- AI must only access authorized tenant data.
- AI actions must use approved server-side tools.
- Validate every AI tool call.
- Require confirmation for sensitive actions (delete, bulk send, financial).
- Log AI usage and execution results.
- Never execute arbitrary generated code.

## Integrations
Use provider adapters for:
- WhatsApp (Cloud API)
- Razorpay (payments)
- Google (Business Profile, reviews)
- Email (SMTP/transactional)
- AI (provider-independent adapter)
- Telephony (voice agents)

Never expose integration secrets to the client.
Verify incoming webhooks with signatures.
Use idempotency keys for external events.

## India-Specific Requirements
- Default currency: INR (₹)
- Default timezone: Asia/Kolkata
- Default country code: IN
- Payment gateway: Razorpay (UPI, cards, net banking)
- Languages: English, Hindi, Telugu (future)
- GST compliance for invoicing
- WhatsApp as primary messaging channel

## Development Workflow
Before implementation:
1. Inspect existing project structure.
2. Read relevant migrations.
3. Identify dependencies.
4. Explain the implementation plan.
5. Implement only the requested module.
6. Run type checks (`npx tsc --noEmit`).
7. Run tests.
8. Review tenant isolation.
9. Report modified files.
10. Report remaining risks.

Never replace working functionality without understanding its dependencies.
Never claim a feature is complete without testing its actual behavior.
