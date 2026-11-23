-- Fix 0032 runner: avoid referencing unassigned v_contact record when appointment has no contact.
-- Safe, idempotent function replacement. No schema changes.

begin;

create or replace function public.workflows_handle_appointment_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workflow record;
  v_action jsonb;
  v_channel text;
  v_delay_hours numeric;
  v_review_link_type text;
  v_review_url text;
  v_template text;
  v_customer_name text;
  v_contact_phone text;
  v_contact_email text;
  v_exists boolean;
  v_token text;
  v_contact_first text;
  v_contact_last text;
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

      v_customer_name := coalesce(nullif(btrim(coalesce(new.customer_name,'')), ''), null);
      v_contact_phone := nullif(btrim(coalesce(new.customer_phone,'')), '');
      v_contact_email := nullif(btrim(coalesce(new.customer_email,'')), '');

      if new.contact_id is not null then
        select c.first_name, c.last_name, c.phone, c.email
        into v_contact_first, v_contact_last, v_contact_phone, v_contact_email
        from public.contacts c
        where c.id = new.contact_id and c.tenant_id = new.tenant_id;
        if found then
          v_customer_name := coalesce(v_customer_name, nullif(btrim(concat_ws(' ', v_contact_first, v_contact_last)), ''));
          v_contact_phone := coalesce(nullif(btrim(coalesce(v_contact_phone,'')), ''), nullif(btrim(coalesce(new.customer_phone,'')), ''));
          v_contact_email := coalesce(nullif(btrim(coalesce(v_contact_email,'')), ''), nullif(btrim(coalesce(new.customer_email,'')), ''));
        else
          v_contact_phone := nullif(btrim(coalesce(new.customer_phone,'')), '');
          v_contact_email := nullif(btrim(coalesce(new.customer_email,'')), '');
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
        v_contact_phone,
        v_contact_email,
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

commit;