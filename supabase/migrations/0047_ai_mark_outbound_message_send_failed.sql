-- Records a rejected WhatsApp send on the exact pending outbound row created
-- for an AI reply. No patient data is read, sent, or stored here; only
-- sanitized provider error details and metadata-only audit fields are written.

begin;

create or replace function public.ai_service_mark_message_send_failed(
  p_tenant uuid,
  p_message uuid,
  p_error_code text,
  p_provider_code text default null,
  p_provider_message text default null,
  p_provider_type text default null,
  p_provider_trace_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated boolean;
  v_code text := left(btrim(coalesce(p_error_code, '')), 100);
  v_provider_code text := nullif(left(btrim(coalesce(p_provider_code, '')), 40), '');
  v_provider_message text := nullif(left(btrim(coalesce(p_provider_message, '')), 300), '');
  v_provider_type text := nullif(left(btrim(coalesce(p_provider_type, '')), 80), '');
  v_provider_trace_id text := nullif(left(btrim(coalesce(p_provider_trace_id, '')), 80), '');
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required for message send failure update';
  end if;
  if v_code = '' then
    raise exception 'Invalid send error code';
  end if;

  update public.messages m
  set delivery_status = 'failed',
      metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object(
        'send_error', jsonb_build_object(
          'code', v_code,
          'provider_code', v_provider_code,
          'provider_message', v_provider_message,
          'provider_type', v_provider_type,
          'provider_trace_id', v_provider_trace_id,
          'at', now()
        )
      )
  where m.id = p_message
    and m.tenant_id = p_tenant
    and m.direction = 'outbound'
    and m.delivery_status = 'pending'
  returning true into v_updated;

  if coalesce(v_updated, false) then
    insert into public.audit_logs (
      tenant_id, actor_id, action, entity_type, entity_id, metadata
    ) values (
      p_tenant,
      null,
      'ai.whatsapp_send_failed',
      'message',
      p_message::text,
      jsonb_build_object(
        'code', v_code,
        'provider_code', v_provider_code,
        'provider_type', v_provider_type,
        'provider_trace_id', v_provider_trace_id,
        'at', now()
      )
    );
  end if;

  return coalesce(v_updated, false);
end;
$$;

-- Supabase default privileges can grant EXECUTE directly to anon/authenticated,
-- so revoking only PUBLIC is not sufficient.
revoke all on function public.ai_service_mark_message_send_failed(uuid, uuid, text, text, text, text, text) from public;
revoke all on function public.ai_service_mark_message_send_failed(uuid, uuid, text, text, text, text, text) from anon;
revoke all on function public.ai_service_mark_message_send_failed(uuid, uuid, text, text, text, text, text) from authenticated;
grant execute on function public.ai_service_mark_message_send_failed(uuid, uuid, text, text, text, text, text) to service_role;

commit;
