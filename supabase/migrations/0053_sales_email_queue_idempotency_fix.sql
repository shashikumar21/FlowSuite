-- ============================================================================
-- 0053_sales_email_queue_idempotency_fix.sql
--
-- sales_queue_approved_email() marked the message as 'queued' on first call,
-- then rejected the second call with 'Message is not approved' because it
-- checked status before looking for an existing idempotency row. Repeat calls
-- were therefore not idempotent.
--
-- This forward-only migration moves the idempotency lookup before the status
-- check. No sending behaviour or public API changes.
-- ============================================================================

create or replace function public.sales_queue_approved_email(
  p_tenant uuid,
  p_message uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_message public.outreach_messages%rowtype;
  v_key text;
  v_existing uuid;
  v_outbox uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if not public.can_manage_sales_agent(p_tenant) then raise exception 'Only an owner or admin can queue outreach'; end if;

  select * into v_message
  from public.outreach_messages
  where id = p_message and tenant_id = p_tenant
  for update;
  if not found then raise exception 'Message not found'; end if;

  v_key := p_tenant::text || ':' || p_message::text;

  -- Idempotency first: a prior queue row is the authoritative answer even
  -- though the message has since moved to status 'queued'.
  select id into v_existing
  from public.outreach_outbox
  where tenant_id = p_tenant and idempotency_key = v_key;
  if found then return v_existing; end if;

  if v_message.status <> 'approved' then raise exception 'Message is not approved'; end if;
  if public.sales_is_suppressed(p_tenant, v_message.recipient_email) then
    raise exception 'Recipient is suppressed; queue refused';
  end if;

  -- provider stays NULL on purpose: no sending integration is configured.
  insert into public.outreach_outbox (
    tenant_id, message_id, prospect_id, recipient_email, status, idempotency_key, attempts
  ) values (
    p_tenant, p_message, v_message.prospect_id, v_message.recipient_email, 'queued', v_key, 0
  ) returning id into v_outbox;

  update public.outreach_messages
  set status = 'queued', updated_at = now()
  where id = p_message and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_caller, 'sales.email_queued', 'outreach_outbox', v_outbox::text,
    jsonb_build_object('message_id', p_message, 'provider', null)
  );

  return v_outbox;
end;
$$;
