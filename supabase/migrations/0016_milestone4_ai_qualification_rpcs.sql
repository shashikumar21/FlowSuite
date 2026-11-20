-- Milestone 4: service-role qualification and follow-up enqueue RPCs.
--
-- The member-facing versions in migration 0014 require an authenticated user.
-- Server-side chat/webhook processing has no end-user JWT, so these variants
-- re-check service_role plus tenant ownership before writing.

begin;

create or replace function public.ai_service_record_assessment(
  p_tenant uuid,
  p_contact uuid,
  p_classification text,
  p_summary text,
  p_intent text default null,
  p_service_interest text default null,
  p_follow_up_recommendation text default null,
  p_conversation uuid default null,
  p_message uuid default null,
  p_provider text default 'openai',
  p_model text default null
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
    raise exception 'Service role required for AI assessments';
  end if;
  if not exists (select 1 from public.contacts where id = p_contact and tenant_id = p_tenant) then
    raise exception 'Contact not found';
  end if;
  if p_classification not in (
    'information_request', 'high_intent', 'future_follow_up',
    'not_interested', 'unknown'
  ) or p_summary is null or length(btrim(p_summary)) not between 1 and 2000 then
    raise exception 'Invalid assessment';
  end if;
  if p_conversation is not null and not exists (
    select 1 from public.conversations where id = p_conversation and tenant_id = p_tenant
  ) then
    raise exception 'Conversation not found';
  end if;
  if p_message is not null and not exists (
    select 1 from public.messages where id = p_message and tenant_id = p_tenant
  ) then
    raise exception 'Message not found';
  end if;

  insert into public.ai_lead_assessments (
    tenant_id, contact_id, conversation_id, message_id, classification,
    intent, summary, service_interest, follow_up_recommendation, provider, model
  ) values (
    p_tenant, p_contact, p_conversation, p_message, p_classification,
    nullif(btrim(coalesce(p_intent, '')), ''), btrim(p_summary),
    nullif(btrim(coalesce(p_service_interest, '')), ''),
    nullif(btrim(coalesce(p_follow_up_recommendation, '')), ''),
    p_provider, p_model
  ) returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, null, 'ai.assessment_recorded', 'ai_lead_assessment', v_id::text);
  return v_id;
end;
$$;

create or replace function public.ai_service_enqueue_follow_up(
  p_tenant uuid,
  p_contact uuid,
  p_sequence uuid,
  p_channel text,
  p_conversation uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step public.ai_follow_up_steps%rowtype;
  v_job uuid;
  v_key text;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required for follow-up enqueue';
  end if;
  if not exists (select 1 from public.contacts where id = p_contact and tenant_id = p_tenant) then
    raise exception 'Contact not found';
  end if;
  if p_channel not in ('whatsapp', 'sms', 'email') then
    raise exception 'Invalid follow-up channel';
  end if;
  select s.* into v_step
  from public.ai_follow_up_steps s
  join public.ai_follow_up_sequences q
    on q.id = s.sequence_id and q.tenant_id = s.tenant_id
  where s.tenant_id = p_tenant and s.sequence_id = p_sequence
    and s.step_index = 1 and s.active = true
    and q.status = 'active' and q.channel = p_channel;
  if not found then raise exception 'No active first step for this sequence and channel'; end if;
  if p_conversation is not null and exists (
    select 1 from public.conversations
    where id = p_conversation and tenant_id = p_tenant
      and ai_status in ('paused', 'handed_off', 'closed')
  ) then
    raise exception 'Automation is paused for this conversation';
  end if;
  if not public.has_consent(p_tenant, p_contact, p_channel) then
    raise exception 'Consent is required before a follow-up can be queued';
  end if;

  v_key := p_tenant::text || '|' || p_sequence::text || '|' || p_contact::text;
  insert into public.ai_follow_up_jobs (
    tenant_id, contact_id, conversation_id, sequence_id, step_id,
    channel, status, due_at, attempts, idempotency_key, consent_status
  ) values (
    p_tenant, p_contact, p_conversation, p_sequence, v_step.id,
    p_channel, 'pending', now() + make_interval(mins => v_step.delay_minutes),
    0, v_key, 'opt_in'
  )
  on conflict (tenant_id, idempotency_key) do nothing
  returning id into v_job;

  if v_job is null then
    select id into v_job from public.ai_follow_up_jobs
    where tenant_id = p_tenant and idempotency_key = v_key;
  end if;
  return v_job;
end;
$$;

revoke all on function public.ai_service_record_assessment(uuid, uuid, text, text, text, text, text, uuid, uuid, text, text) from public;
revoke all on function public.ai_service_enqueue_follow_up(uuid, uuid, uuid, text, uuid) from public;

grant execute on function public.ai_service_record_assessment(uuid, uuid, text, text, text, text, text, uuid, uuid, text, text),
  public.ai_service_enqueue_follow_up(uuid, uuid, uuid, text, uuid) to service_role;

commit;
