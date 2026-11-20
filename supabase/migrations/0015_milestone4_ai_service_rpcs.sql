-- Milestone 4: service-role RPCs required by Edge Functions.
--
-- Migration 0014 intentionally exposes member-facing configuration RPCs to
-- authenticated users and ingestion RPCs to service_role. Website chat and
-- provider webhooks are anonymous/server-side, so they need explicit
-- service-role equivalents that re-check role and tenant ownership. No raw
-- provider credential is accepted by any function here.

begin;

-- Public-safe agent config plus server-only identifiers, readable only by the
-- service role. Mirrors ai_get_public_agent without exposing this to anon.
create or replace function public.ai_service_get_agent(p_public_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_agent public.ai_agents%rowtype;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required for AI agent lookup';
  end if;
  if p_public_key is null or p_public_key !~ '^[0-9a-f]{64}$' then
    return '{}'::jsonb;
  end if;

  select * into v_agent
  from public.ai_agents
  where public_key = p_public_key and status = 'active';
  if not found then return '{}'::jsonb; end if;

  return jsonb_build_object(
    'agent_id', v_agent.id,
    'tenant_id', v_agent.tenant_id,
    'public_key', v_agent.public_key,
    'name', v_agent.name,
    'handoff_user_id', v_agent.handoff_user_id,
    'language', v_agent.language,
    'tone', v_agent.tone,
    'response_style', v_agent.response_style,
    'business_info', v_agent.business_info,
    'working_hours', v_agent.working_hours,
    'business_name', (select name from public.businesses where id = v_agent.tenant_id),
    'booking_permission', v_agent.booking_permission,
    'booking_slug', (
      select slug from public.booking_pages
      where tenant_id = v_agent.tenant_id and active = true
      order by created_at limit 1
    ),
    'knowledge', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', k.category, 'title', k.title, 'content', k.content
      ) order by k.created_at)
      from public.ai_agent_knowledge k
      where k.tenant_id = v_agent.tenant_id
        and k.agent_id = v_agent.id
        and k.active = true
        and k.approved_at is not null
    ), '[]'::jsonb),
    'tools', coalesce((
      select jsonb_agg(t.tool_key order by t.tool_key)
      from public.ai_agent_tools t
      where t.tenant_id = v_agent.tenant_id
        and t.agent_id = v_agent.id and t.enabled = true
    ), '[]'::jsonb)
  );
end;
$$;

-- Resolves the single active agent for a tenant (webhook path).
create or replace function public.ai_service_get_active_agent(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_public_key text;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required for AI agent lookup';
  end if;
  select public_key into v_public_key
  from public.ai_agents
  where tenant_id = p_tenant and status = 'active'
  order by created_at limit 1;
  if v_public_key is null then return '{}'::jsonb; end if;
  return public.ai_service_get_agent(v_public_key);
end;
$$;

-- Same authoritative limit as ai_check_usage_limit, but callable by a trusted
-- server function with no end-user JWT.
create or replace function public.ai_service_check_usage_limit(p_tenant uuid, p_agent uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_used integer;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required for AI usage checks';
  end if;
  select monthly_token_limit into v_limit
  from public.ai_agents where id = p_agent and tenant_id = p_tenant;
  if not found then return false; end if;
  if v_limit is null then return true; end if;

  select coalesce(sum(total_tokens), 0) into v_used
  from public.ai_usage_logs
  where tenant_id = p_tenant and agent_id = p_agent
    and created_at >= date_trunc('month', now());
  return v_used < v_limit;
end;
$$;

-- Server-side consent write used when a website visitor explicitly opts in.
create or replace function public.ai_service_set_consent(
  p_tenant uuid,
  p_contact uuid,
  p_channel text,
  p_status text,
  p_source text,
  p_proof jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required for server-side consent writes';
  end if;
  if not exists (select 1 from public.contacts where id = p_contact and tenant_id = p_tenant) then
    raise exception 'Contact not found';
  end if;
  if p_channel not in ('whatsapp', 'sms', 'email', 'voice')
    or p_status not in ('opt_in', 'opt_out')
    or p_source not in ('website_chat', 'whatsapp', 'manual', 'import', 'staff', 'booking') then
    raise exception 'Invalid consent value';
  end if;

  insert into public.communication_consents (
    tenant_id, contact_id, channel, status, source, proof, consented_at, revoked_at
  ) values (
    p_tenant, p_contact, p_channel, p_status, p_source,
    coalesce(p_proof, '{}'::jsonb), now(),
    case when p_status = 'opt_out' then now() else null end
  )
  on conflict (tenant_id, contact_id, channel)
  do update set status = excluded.status, source = excluded.source,
    proof = excluded.proof,
    consented_at = case when excluded.status = 'opt_in' then now()
      else communication_consents.consented_at end,
    revoked_at = case when excluded.status = 'opt_out' then now() else null end,
    updated_at = now()
  returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, null, 'ai.consent_changed', 'communication_consent', v_id::text);
  return v_id;
end;
$$;

-- Server-side handoff for safety escalations and explicit AI requests.
create or replace function public.ai_service_handoff_conversation(
  p_tenant uuid,
  p_conversation uuid,
  p_to_user uuid,
  p_reason text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required for server-side handoff';
  end if;
  if not exists (
    select 1 from public.conversations where id = p_conversation and tenant_id = p_tenant
  ) then
    raise exception 'Conversation not found';
  end if;
  if not public.is_active_member(p_tenant, p_to_user) then
    raise exception 'Handoff target must be an active member';
  end if;

  update public.conversations
  set assigned_to = p_to_user,
      ai_status = 'handed_off',
      ai_handed_off_at = now(),
      status = case when status = 'closed' then 'open' else status end
  where id = p_conversation and tenant_id = p_tenant;

  insert into public.conversation_handoffs (
    tenant_id, conversation_id, from_user_id, to_user_id, reason, note
  ) values (
    p_tenant, p_conversation, null, p_to_user, p_reason, p_note
  ) returning id into v_id;

  insert into public.notifications (
    tenant_id, user_id, notification_type, title, body, entity_type, entity_id
  ) values (
    p_tenant, p_to_user, 'conversation_assigned',
    'An AI conversation was handed over to you', p_reason, 'conversation', p_conversation
  );

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, null, 'ai.conversation_handoff', 'conversation', p_conversation::text);
  return v_id;
end;
$$;

revoke all on function public.ai_service_get_agent(text) from public;
revoke all on function public.ai_service_get_active_agent(uuid) from public;
revoke all on function public.ai_service_check_usage_limit(uuid, uuid) from public;
revoke all on function public.ai_service_set_consent(uuid, uuid, text, text, text, jsonb) from public;
revoke all on function public.ai_service_handoff_conversation(uuid, uuid, uuid, text, text) from public;

grant execute on function public.ai_service_get_agent(text),
  public.ai_service_get_active_agent(uuid),
  public.ai_service_check_usage_limit(uuid, uuid),
  public.ai_service_set_consent(uuid, uuid, text, text, text, jsonb),
  public.ai_service_handoff_conversation(uuid, uuid, uuid, text, text) to service_role;

commit;
