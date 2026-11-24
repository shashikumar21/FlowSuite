-- ============================================================================
-- 0050_service_only_acl_hardening.sql
--
-- Supabase applies default privileges that grant anon/authenticated access to
-- newly created tables and functions. Several service-only billing tables and
-- AI/billing service RPCs were therefore exposed at the GRANT layer even though
-- their function bodies already require the service role.
--
-- This forward-only migration removes those implicit grants. It does not change
-- any function body or any tenant-facing RPC.
-- ============================================================================

-- Trusted ledger tables must not be callable/readable from browser roles.
revoke all on table public.billing_webhook_events from anon, authenticated;
revoke all on table public.billing_orders from anon;

-- AI service helpers: only Edge Functions using the service role may call these.
revoke all on function public.ai_service_check_usage_limit(p_tenant uuid, p_agent uuid) from public, anon, authenticated;
revoke all on function public.ai_service_enqueue_follow_up(p_tenant uuid, p_contact uuid, p_sequence uuid, p_channel text, p_conversation uuid) from public, anon, authenticated;
revoke all on function public.ai_service_get_active_agent(p_tenant uuid) from public, anon, authenticated;
revoke all on function public.ai_service_get_agent(p_public_key text) from public, anon, authenticated;
revoke all on function public.ai_service_handoff_conversation(p_tenant uuid, p_conversation uuid, p_to_user uuid, p_reason text, p_note text) from public, anon, authenticated;
revoke all on function public.ai_service_mark_message_delivered(p_tenant uuid, p_message uuid, p_provider_message_id text) from public, anon, authenticated;
revoke all on function public.ai_service_mark_message_send_failed(p_tenant uuid, p_message uuid, p_error_code text, p_provider_code text, p_provider_message text, p_provider_type text, p_provider_trace_id text) from public, anon, authenticated;
revoke all on function public.ai_service_record_assessment(p_tenant uuid, p_contact uuid, p_classification text, p_summary text, p_intent text, p_service_interest text, p_follow_up_recommendation text, p_conversation uuid, p_message uuid, p_provider text, p_model text) from public, anon, authenticated;
revoke all on function public.ai_service_set_consent(p_tenant uuid, p_contact uuid, p_channel text, p_status text, p_source text, p_proof jsonb) from public, anon, authenticated;

grant execute on function public.ai_service_check_usage_limit(p_tenant uuid, p_agent uuid) to service_role;
grant execute on function public.ai_service_enqueue_follow_up(p_tenant uuid, p_contact uuid, p_sequence uuid, p_channel text, p_conversation uuid) to service_role;
grant execute on function public.ai_service_get_active_agent(p_tenant uuid) to service_role;
grant execute on function public.ai_service_get_agent(p_public_key text) to service_role;
grant execute on function public.ai_service_handoff_conversation(p_tenant uuid, p_conversation uuid, p_to_user uuid, p_reason text, p_note text) to service_role;
grant execute on function public.ai_service_mark_message_delivered(p_tenant uuid, p_message uuid, p_provider_message_id text) to service_role;
grant execute on function public.ai_service_mark_message_send_failed(p_tenant uuid, p_message uuid, p_error_code text, p_provider_code text, p_provider_message text, p_provider_type text, p_provider_trace_id text) to service_role;
grant execute on function public.ai_service_record_assessment(p_tenant uuid, p_contact uuid, p_classification text, p_summary text, p_intent text, p_service_interest text, p_follow_up_recommendation text, p_conversation uuid, p_message uuid, p_provider text, p_model text) to service_role;
grant execute on function public.ai_service_set_consent(p_tenant uuid, p_contact uuid, p_channel text, p_status text, p_source text, p_proof jsonb) to service_role;

-- Billing service helpers: only Edge Functions using the service role may call these.
revoke all on function public.billing_service_activate_subscription(p_tenant uuid, p_plan_id uuid, p_provider_order_id text, p_provider_payment_id text, p_period_start timestamp with time zone, p_period_end timestamp with time zone) from public, anon, authenticated;
revoke all on function public.billing_service_finish_webhook_event(p_provider_event_id text, p_status text, p_error text) from public, anon, authenticated;
revoke all on function public.billing_service_mark_order_failed(p_provider_order_id text, p_error text) from public, anon, authenticated;
revoke all on function public.billing_service_record_order(p_tenant uuid, p_plan_id uuid, p_provider_order_id text, p_amount_paise integer, p_currency text, p_billing_cycle text, p_created_by uuid) from public, anon, authenticated;
revoke all on function public.billing_service_record_webhook_event(p_provider_event_id text, p_event_type text, p_payload jsonb) from public, anon, authenticated;

grant execute on function public.billing_service_activate_subscription(p_tenant uuid, p_plan_id uuid, p_provider_order_id text, p_provider_payment_id text, p_period_start timestamp with time zone, p_period_end timestamp with time zone) to service_role;
grant execute on function public.billing_service_finish_webhook_event(p_provider_event_id text, p_status text, p_error text) to service_role;
grant execute on function public.billing_service_mark_order_failed(p_provider_order_id text, p_error text) to service_role;
grant execute on function public.billing_service_record_order(p_tenant uuid, p_plan_id uuid, p_provider_order_id text, p_amount_paise integer, p_currency text, p_billing_cycle text, p_created_by uuid) to service_role;
grant execute on function public.billing_service_record_webhook_event(p_provider_event_id text, p_event_type text, p_payload jsonb) to service_role;
