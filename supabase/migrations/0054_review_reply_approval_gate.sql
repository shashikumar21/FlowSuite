-- ============================================================================
-- 0054_review_reply_approval_gate.sql
--
-- Forward-only fix for 0049. It enforces the approved review-reply rule:
-- a draft must be explicitly approved by a manager/owner/admin before it can
-- be copied for manual posting. It also exposes owner_reply_status through the
-- safe UI list (never the draft text) so refresh cannot lose the approval state.
-- ============================================================================

create or replace function public.review_reply_set_status(
  p_tenant uuid,
  p_request uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_row record;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Access denied';
  end if;
  if not public.has_tenant_role(p_tenant, array['owner', 'admin', 'manager']) then
    raise exception 'Manager role required to update review replies';
  end if;
  if p_status not in ('approved', 'rejected', 'copied') then
    raise exception 'Invalid status';
  end if;

  select owner_reply_status, owner_reply_draft, owner_reply_approved_by, owner_reply_approved_at
    into v_row
    from public.review_requests
   where id = p_request and tenant_id = p_tenant
   for update;
  if not found or v_row.owner_reply_draft is null then
    raise exception 'Review reply draft not found';
  end if;
  if v_row.owner_reply_status in ('not_requested', 'rejected') then
    raise exception 'No active draft to update';
  end if;

  if p_status = 'approved' then
    if v_row.owner_reply_status not in ('generated', 'fallback') then
      raise exception 'No active draft to approve';
    end if;
  elsif p_status = 'copied' then
    if v_row.owner_reply_status <> 'approved'
       or v_row.owner_reply_approved_by is null
       or v_row.owner_reply_approved_at is null then
      raise exception 'Approve the reply before copying';
    end if;
  end if;

  update public.review_requests
     set owner_reply_status = p_status,
         owner_reply_approved_by = case when p_status = 'approved' then v_actor else owner_reply_approved_by end,
         owner_reply_approved_at = case when p_status = 'approved' then now() else owner_reply_approved_at end,
         owner_reply_copied_at = case when p_status = 'copied' then now() else owner_reply_copied_at end,
         updated_at = now()
   where id = p_request and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_actor, 'review_reply.' || p_status, 'review_request', p_request::text,
    jsonb_build_object('ai_assisted', true, 'status', p_status)
  );
end;
$$;

revoke all on function public.review_reply_set_status(uuid, uuid, text) from public, anon;
grant execute on function public.review_reply_set_status(uuid, uuid, text) to authenticated;

-- The safe list already excludes owner_reply_draft. Adding only the status lets
-- the UI disable Copy after a refresh or after a rejection.
create or replace function public.review_requests_list_for_ui(p_tenant uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Access denied';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'tenant_id', r.tenant_id,
        'customer_name', r.customer_name,
        'customer_phone', r.customer_phone,
        'channel', r.channel,
        'review_link_type', r.review_link_type,
        'review_url', r.review_url,
        'status', r.status,
        'rating', r.rating,
        'customer_feedback', r.customer_feedback,
        'ai_suggestion_status', r.ai_suggestion_status,
        'public_token', r.public_token,
        'scheduled_for', r.scheduled_for,
        'owner_reply_status', r.owner_reply_status,
        'created_at', r.created_at
      )
      order by r.created_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select *
      from public.review_requests
     where tenant_id = p_tenant
     order by created_at desc
     limit 50
  ) r;

  return v_result;
end;
$$;

revoke all on function public.review_requests_list_for_ui(uuid) from public, anon;
grant execute on function public.review_requests_list_for_ui(uuid) to authenticated;
