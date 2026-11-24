-- ============================================================================
-- 0052_sales_email_approval_decision_fix.sql
--
-- sales_review_email_draft() accepts 'approve'/'reject' but writes the raw
-- value into public.sales_email_approvals.decision, whose CHECK constraint
-- allows 'approved'/'rejected'. Every approval/rejection therefore failed with
-- a constraint violation before the audit row could be written.
--
-- This forward-only migration replaces the function with the correct mapping.
-- The public API ('approve'/'reject') is unchanged.
-- ============================================================================

create or replace function public.sales_review_email_draft(
  p_tenant uuid,
  p_message uuid,
  p_decision text,
  p_edited_subject text,
  p_edited_body text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_message public.outreach_messages%rowtype;
  v_subject text;
  v_body text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if not public.can_manage_sales_agent(p_tenant) then raise exception 'Only an owner or admin can review outreach'; end if;
  if coalesce(p_decision, '') not in ('approve', 'reject') then raise exception 'Invalid decision'; end if;

  select * into v_message
  from public.outreach_messages
  where id = p_message and tenant_id = p_tenant
  for update;
  if not found then raise exception 'Message not found'; end if;
  if v_message.status <> 'pending_approval' then raise exception 'Message is not awaiting approval'; end if;

  v_subject := v_message.subject;
  v_body := v_message.body;
  if p_edited_subject is not null then
    if length(btrim(p_edited_subject)) not between 1 and 200 then raise exception 'Invalid edited subject'; end if;
    v_subject := btrim(p_edited_subject);
  end if;
  if p_edited_body is not null then
    if length(btrim(p_edited_body)) not between 1 and 10000 then raise exception 'Invalid edited body'; end if;
    v_body := btrim(p_edited_body);
  end if;

  if p_decision = 'approve' then
    if public.sales_is_suppressed(p_tenant, v_message.recipient_email) then
      raise exception 'Recipient is suppressed; approval refused';
    end if;
    update public.outreach_messages
    set status = 'approved',
        subject = v_subject,
        body = v_body,
        approved_by = v_caller,
        approved_at = now(),
        rejected_reason = null,
        updated_at = now()
    where id = p_message and tenant_id = p_tenant;

    if not exists (
      select 1 from public.outreach_messages m
      where m.campaign_id = v_message.campaign_id and m.tenant_id = p_tenant
        and m.status in ('draft', 'pending_approval', 'rejected')
    ) then
      update public.outreach_campaigns
      set status = 'approved', updated_at = now()
      where id = v_message.campaign_id and tenant_id = p_tenant;
    end if;
  else
    if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'A rejection reason is required'; end if;
    update public.outreach_messages
    set status = 'rejected', rejected_reason = btrim(p_reason), updated_at = now()
    where id = p_message and tenant_id = p_tenant;

    update public.outreach_campaigns
    set status = 'rejected', rejected_reason = btrim(p_reason), updated_at = now()
    where id = v_message.campaign_id and tenant_id = p_tenant;
  end if;

  insert into public.sales_email_approvals (
    tenant_id, campaign_id, message_id, decision, actor_id, edited_subject, edited_body, reason
  ) values (
    p_tenant, v_message.campaign_id, p_message,
    case when p_decision = 'approve' then 'approved' else 'rejected' end,
    v_caller,
    nullif(btrim(coalesce(p_edited_subject, '')), ''),
    nullif(btrim(coalesce(p_edited_body, '')), ''),
    nullif(btrim(coalesce(p_reason, '')), '')
  );

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_caller,
    case when p_decision = 'approve' then 'sales.email_approved' else 'sales.email_rejected' end,
    'outreach_message', p_message::text,
    jsonb_build_object('decision', p_decision, 'edited', p_edited_subject is not null or p_edited_body is not null)
  );
end;
$$;
