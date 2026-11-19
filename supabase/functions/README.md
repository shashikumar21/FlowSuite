# Edge Functions

This directory is reserved for trusted server-side code. No function is deployed in Milestone 1.

Planned functions (each gets its own folder and test):

| Function | Responsibility |
| --- | --- |
| `razorpay-webhook` | Verify signature, enforce idempotency, update subscription entitlements |
| `whatsapp-webhook` | Verify signature, deduplicate by provider message ID, route to conversations |
| `ai-tool-executor` | Validate tenant scope and permissions before running an approved AI tool; log usage |
| `send-campaign` | Check consent and plan limits before dispatching messages |
| `telephony-webhook` | Verify provider signature and manage inbound call state |
| `google-oauth-callback` | Store provider tokens encrypted, scoped to the tenant |

Rules:

- All integration secrets stay here as Supabase secrets — never in `VITE_*` variables or browser code.
- Verify every webhook signature and use idempotency keys for external events.
- Re-check `auth.uid()`, tenant membership and plan entitlements server-side; never trust a client-supplied role.
- Use `service_role` only inside functions, never in the browser.
