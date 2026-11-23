-- Review-request audit logging (LOCAL ONLY — not applied to hosted without approval).
-- Approval is restricted to manager+ and every approval/cancellation is written
-- to the immutable audit_logs table. Sends are audited by the Edge Function
-- using the service role, with the authenticated actor id preserved.

create or replace function public.review_request_set_status(
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
  v_channel text;
  v_link_type text;
begin
  if (select auth.uid()) is null or not public.has_tenant_role(p_tenant, array['owner', 'admin', 'manager']) then
    raise exception 'Manager role required to approve review requests';
  end if;
  if p_status not in ('approved', 'cancelled') then
    raise exception 'Invalid status';
  end if;

  select channel, review_link_type
  into v_channel, v_link_type
  from public.review_requests
  where id = p_request and tenant_id = p_tenant
  for update;
  if not found then
    raise exception 'Review request not found or not pending approval';
  end if;

  update public.review_requests
  set status = p_status,
      approved_at = case when p_status = 'approved' then now() else approved_at end,
      approved_by = case when p_status = 'approved' then v_actor else approved_by end,
      updated_at = now()
  where id = p_request and tenant_id = p_tenant
    and status = 'pending_approval';
  if not found then
    raise exception 'Review request not found or not pending approval';
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant,
    v_actor,
    case when p_status = 'approved' then 'review_request.approved' else 'review_request.cancelled' end,
    'review_request',
    p_request::text,
    jsonb_build_object('status', p_status, 'channel', v_channel, 'review_link_type', v_link_type)
  );
end;
$$;

revoke all on function public.review_request_set_status(uuid, uuid, text) from public, anon;
grant execute on function public.review_request_set_status(uuid, uuid, text) to authenticated;
