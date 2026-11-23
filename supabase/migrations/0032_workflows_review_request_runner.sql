-- Workflows review-request runner MVP (local only, no auto-send).
-- Creates pending_approval review_requests when an appointment becomes completed,
-- based on active workflows with trigger_type='appointment_completed' and a
-- send_review_request action. No external messages are sent.

begin;

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
begin
  if not public.has_tenant_access(p_tenant) then
    raise exception 'Access denied';
  end if;
  if p_status not in ('approved', 'cancelled') then
    raise exception 'Invalid status';
  end if;
  update public.review_requests
  set status = p_status,
      approved_at = case when p_status = 'approved' then now() else approved_at end,
      approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
      updated_at = now()
  where id = p_request and tenant_id = p_tenant
    and status = 'pending_approval';
  if not found then
    raise exception 'Review request not found or not pending approval';
  end if;
end;
$$;

revoke all on function public.review_request_set_status(uuid, uuid, text) from public, anon;
grant execute on function public.review_request_set_status(uuid, uuid, text) to authenticated;

create or replace function public.workflows_handle_appointment_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workflow record;
  v_action jsonb;
  v_contact record;
  v_channel text;
  v_delay_hours numeric;
  v_review_link_type text;
  v_review_url text;
  v_template text;
  v_customer_name text;
  v_exists boolean;
  v_contact_found boolean;
  v_token text;
begin
  if tg_op <> 'UPDATE' then return new; end if;
  if new.status <> 'completed' then return new; end if;
  if old.status is not distinct from new.status then return new; end if;

  for v_workflow in
    select id, actions
    from public.workflows
    where tenant_id = new.tenant_id
      and trigger_type = 'appointment_completed'
      and status = 'active'
  loop
    for v_action in select * from jsonb_array_elements(coalesce(v_workflow.actions, '[]'::jsonb))
    loop
      if coalesce(v_action->>'type', '') <> 'send_review_request' then continue; end if;

      v_channel := case when coalesce(v_action->'config'->>'channel','whatsapp') in ('whatsapp','sms','email')
        then v_action->'config'->>'channel' else 'whatsapp' end;
      v_delay_hours := coalesce((v_action->'config'->>'delay_hours')::numeric, 2);
      if v_delay_hours < 0 then v_delay_hours := 0; end if;
      v_review_link_type := case when coalesce(v_action->'config'->>'review_link_type','flowsuite') in ('flowsuite','google','custom')
        then v_action->'config'->>'review_link_type' else 'flowsuite' end;
      v_review_url := nullif(btrim(coalesce(v_action->'config'->>'review_url','')), '');
      v_template := nullif(btrim(coalesce(v_action->'config'->>'value','')), '');

      select exists(
        select 1 from public.review_requests rr
        where rr.tenant_id = new.tenant_id
          and rr.appointment_id = new.id
          and rr.workflow_id = v_workflow.id
          and rr.channel = v_channel
      ) into v_exists;
      if v_exists then continue; end if;

      v_customer_name := null;
      v_contact_found := false;
      if new.contact_id is not null then
        select c.first_name, c.last_name, c.phone, c.email
        into v_contact
        from public.contacts c
        where c.id = new.contact_id and c.tenant_id = new.tenant_id;
        v_contact_found := found;
        if v_contact_found then
          v_customer_name := nullif(btrim(concat_ws(' ', v_contact.first_name, v_contact.last_name)), '');
        end if;
      end if;

      v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

      insert into public.review_requests (
        tenant_id, workflow_id, appointment_id, contact_id,
        customer_name, customer_phone, customer_email,
        channel, review_link_type, review_url, message_template,
        status, scheduled_for, public_token
      ) values (
        new.tenant_id, v_workflow.id, new.id, new.contact_id,
        v_customer_name,
        case when v_contact_found then v_contact.phone else null end,
        case when v_contact_found then v_contact.email else null end,
        v_channel, v_review_link_type, v_review_url, v_template,
        'pending_approval', now() + make_interval(secs => (v_delay_hours * 3600)::int), v_token
      );

      update public.workflows
      set run_count = run_count + 1, last_run_at = now(), updated_at = now()
      where id = v_workflow.id and tenant_id = new.tenant_id;
    end loop;
  end loop;

  return new;
end;
$$;

drop trigger if exists workflows_review_request_on_appointment_completed on public.appointments;
create trigger workflows_review_request_on_appointment_completed
  after update of status on public.appointments
  for each row
  execute function public.workflows_handle_appointment_completed();

commit;
