-- Write the provider send result back to the exact outbound row that was
-- created for an AI reply. No patient data is read, sent, or stored here.

begin;

create or replace function public.ai_service_mark_message_delivered(
  p_tenant uuid,
  p_message uuid,
  p_provider_message_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated boolean;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required for message delivery update';
  end if;
  if p_provider_message_id is null or length(btrim(p_provider_message_id)) = 0
    or length(p_provider_message_id) > 255 then
    raise exception 'Invalid provider message id';
  end if;

  update public.messages m
  set provider_message_id = btrim(p_provider_message_id),
      delivery_status = 'sent',
      delivered_at = now()
  where m.id = p_message
    and m.tenant_id = p_tenant
    and m.direction = 'outbound'
    and m.delivery_status = 'pending'
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;

-- Supabase default privileges can grant EXECUTE directly to anon/authenticated,
-- so revoking only PUBLIC is not sufficient.
revoke all on function public.ai_service_mark_message_delivered(uuid, uuid, text) from public;
revoke all on function public.ai_service_mark_message_delivered(uuid, uuid, text) from anon;
revoke all on function public.ai_service_mark_message_delivered(uuid, uuid, text) from authenticated;
grant execute on function public.ai_service_mark_message_delivered(uuid, uuid, text) to service_role;

commit;
