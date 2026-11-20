-- Hotfix for Milestone 3 RPCs (also folded into 0010 for fresh installs):
--
-- 1. notify_booking_users() excluded the current actor with
--    `recipient.user_id <> auth.uid()`. For an anonymous booking auth.uid() is
--    NULL, so every comparison evaluated to NULL and no staff notification was
--    created. Treat a NULL actor as "notify everyone".
-- 2. inbox_create_conversation() did not populate the legacy NOT NULL
--    `conversations.channel` text column from migration 0001.
-- 3. inbox_send_message() used an inner join on channels, so a conversation
--    without a linked channel could not receive messages.
--
-- Apply this file on databases that already ran 0010. It only replaces
-- functions, so re-running it is safe.
--
begin;

create or replace function public.notify_booking_users(
  p_tenant uuid,
  p_type text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid,
  p_appointment uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in
    select distinct recipient.user_id
    from (
      select m.user_id
      from public.business_members m
      where m.tenant_id = p_tenant
        and m.status = 'active'
        and m.role in ('owner', 'admin', 'manager')

      union

      select r.member_user_id
      from public.appointments a
      join public.booking_resources r
        on r.id = a.resource_id and r.tenant_id = a.tenant_id
      where a.id = p_appointment and a.tenant_id = p_tenant
        and r.member_user_id is not null

      union

      select c.assigned_to
      from public.appointments a
      join public.contacts c
        on c.id = a.contact_id and c.tenant_id = a.tenant_id
      where a.id = p_appointment and a.tenant_id = p_tenant
        and c.assigned_to is not null
    ) as recipient
    where recipient.user_id is not null
      and (recipient.user_id <> (select auth.uid()) or (select auth.uid()) is null)
  loop
    insert into public.notifications (
      tenant_id, user_id, notification_type, title, body,
      entity_type, entity_id, delivery_channel, delivery_status
    ) values (
      p_tenant, v_user, p_type, p_title, p_body,
      p_entity_type, p_entity_id, 'in_app', 'sent'
    );
  end loop;
end;
$$;

create or replace function public.inbox_create_conversation(
  p_tenant uuid,
  p_contact_id uuid default null,
  p_channel_id uuid default null,
  p_subject text default null,
  p_customer_name text default null,
  p_customer_email text default null,
  p_assigned_to uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_internal uuid;
  v_channel_type text := 'internal';
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to create conversations for this business';
  end if;
  if p_contact_id is not null and not exists (
    select 1 from public.contacts where id = p_contact_id and tenant_id = p_tenant
  ) then
    raise exception 'Contact not found';
  end if;
  if p_channel_id is not null and not exists (
    select 1 from public.channels where id = p_channel_id and tenant_id = p_tenant and active = true
  ) then
    raise exception 'Channel not found';
  end if;
  if p_assigned_to is not null and not public.is_active_member(p_tenant, p_assigned_to) then
    raise exception 'Assignee must be an active member of this business';
  end if;

  if p_channel_id is null then
    select id, channel_type into v_internal, v_channel_type
    from public.channels
    where tenant_id = p_tenant and channel_type = 'internal' and active = true
    order by created_at
    limit 1;
  else
    select channel_type into v_channel_type
    from public.channels
    where id = p_channel_id and tenant_id = p_tenant and active = true;
  end if;

  -- `channel` is a legacy NOT NULL text column from migration 0001.
  insert into public.conversations (
    tenant_id, contact_id, channel_id, channel, subject, customer_name,
    customer_email, status, priority, assigned_to, last_message_at
  ) values (
    p_tenant, p_contact_id, coalesce(p_channel_id, v_internal),
    coalesce(v_channel_type, 'internal'), p_subject,
    p_customer_name, p_customer_email, 'open', 'normal', p_assigned_to, now()
  ) returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'conversation.created', 'conversation', v_id::text);

  if p_assigned_to is not null then
    insert into public.notifications (
      tenant_id, user_id, notification_type, title, entity_type, entity_id
    ) values (
      p_tenant, p_assigned_to, 'conversation_assigned',
      'A conversation was assigned to you', 'conversation', v_id
    );
  end if;
  return v_id;
end;
$$;

create or replace function public.inbox_send_message(
  p_tenant uuid,
  p_conversation uuid,
  p_content text,
  p_message_type text default 'text',
  p_is_internal boolean default false,
  p_external_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_channel text;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to send messages for this business';
  end if;
  if p_content is null or length(trim(p_content)) = 0 or length(p_content) > 10000 then
    raise exception 'Message must be between 1 and 10000 characters';
  end if;
  if p_message_type not in ('text', 'image', 'file', 'system', 'email', 'whatsapp') then
    raise exception 'Invalid message type';
  end if;

  select c.channel_type into v_channel
  from public.conversations conv
  left join public.channels c on c.id = conv.channel_id and c.tenant_id = conv.tenant_id
  where conv.id = p_conversation and conv.tenant_id = p_tenant;
  if not found then
    raise exception 'Conversation not found';
  end if;

  if p_external_id is not null and exists (
    select 1 from public.messages
    where tenant_id = p_tenant and provider_message_id = p_external_id
  ) then
    raise exception 'Duplicate provider message id';
  end if;

  insert into public.messages (
    tenant_id, conversation_id, direction, message_type, content,
    provider_message_id, delivery_status, author_id, author_type,
    is_internal, delivered_at, metadata
  ) values (
    p_tenant, p_conversation, 'outbound', p_message_type, trim(p_content),
    p_external_id, case when p_is_internal then 'sent' else 'pending' end,
    (select auth.uid()), 'staff', p_is_internal,
    case when p_is_internal then now() else null end, '{}'::jsonb
  ) returning id into v_id;

  update public.conversations
  set last_message_at = now(),
      status = case when status = 'closed' then 'open' else status end
  where id = p_conversation and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, (select auth.uid()), 'message.sent', 'message', v_id::text,
          jsonb_build_object('internal', p_is_internal, 'channel', v_channel));
  return v_id;
end;
$$;

commit;
