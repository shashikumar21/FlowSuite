-- Deal deletion via server-side RPC (local only, approval-gated).
-- Destructive action: exposed only through trusted RPC, not direct client delete.

begin;

create or replace function public.crm_delete_deal(p_tenant uuid, p_deal uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted uuid;
begin
  if not public.can_manage_crm(p_tenant) then
    raise exception 'Not allowed to delete deals';
  end if;

  delete from public.deals
  where id = p_deal and tenant_id = p_tenant
  returning id into v_deleted;

  if v_deleted is null then
    raise exception 'Deal not found';
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, auth.uid(), 'crm.deal_deleted', 'deal', v_deleted::text);
end;
$$;

revoke all on function public.crm_delete_deal(uuid, uuid) from public, anon;
grant execute on function public.crm_delete_deal(uuid, uuid) to authenticated;

commit;
