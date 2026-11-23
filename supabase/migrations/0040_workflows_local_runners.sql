-- Local workflow runners for Painter 1/2/3/5 (LOCAL ONLY — not applied to hosted
-- without explicit approval).
--
-- Contract:
-- * Only local side effects: tasks, in-app notifications, run/step logs and audit.
-- * No HTTP, no pg_net, no cron, no messaging provider, no review_requests writes.
-- * send_review_request stays exclusively with the Painter 4 appointment-completed
--   runner, so these runners can never send a message or request a review.
-- * One source event maps to at most one run per workflow via a unique index.

begin;

-- ---------------------------------------------------------------------------
-- 1. Additive schema changes
-- ---------------------------------------------------------------------------
alter table public.workflow_runs add column if not exists source_table text;
alter table public.workflow_runs add column if not exists source_id uuid;

create unique index if not exists workflow_runs_event_dedupe_idx
  on public.workflow_runs (tenant_id, workflow_id, trigger_type, source_table, source_id)
  where source_id is not null;

-- Generic workflow notices are in-app only. Existing values are preserved.
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type in (
    'appointment_new', 'appointment_confirmed', 'appointment_cancelled',
    'appointment_rescheduled', 'appointment_upcoming', 'conversation_assigned',
    'message_received', 'workflow_notification'
  ));

-- ---------------------------------------------------------------------------
-- 2. Central local executor
-- ---------------------------------------------------------------------------
create or replace function public.workflows_execute_local_actions(
  p_tenant uuid,
  p_workflow uuid,
  p_trigger_type text,
  p_source_table text,
  p_source_id uuid,
  p_payload jsonb,
  p_actor uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workflow public.workflows%rowtype;
  v_actions jsonb;
  v_action jsonb;
  v_index integer;
  v_type text;
  v_label text;
  v_config jsonb;
  v_run_id uuid;
  v_step_id uuid;
  v_title text;
  v_body text;
  v_recipient record;
  v_skipped integer := 0;
  v_done integer := 0;
  v_failed integer := 0;
begin
  select * into v_workflow
  from public.workflows
  where id = p_workflow
    and tenant_id = p_tenant
    and trigger_type = p_trigger_type
    and status = 'active';
  if not found then return null; end if;

  v_actions := case when jsonb_typeof(v_workflow.actions) = 'array' then v_workflow.actions else '[]'::jsonb end;

  -- A run log is mandatory. If the billing limit trigger blocks it, do nothing
  -- else so no workflow side effect can happen without an auditable run.
  begin
    insert into public.workflow_runs (
      tenant_id, workflow_id, trigger_type, trigger_payload,
      status, started_at, source_table, source_id
    ) values (
      p_tenant, p_workflow, p_trigger_type, coalesce(p_payload, '{}'::jsonb),
      'running', now(), p_source_table, p_source_id
    )
    on conflict (tenant_id, workflow_id, trigger_type, source_table, source_id)
      where source_id is not null
      do nothing
    returning id into v_run_id;
  exception when others then
    insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      p_tenant, p_actor, 'workflow.run_log_failed', 'workflow', p_workflow::text,
      jsonb_build_object('trigger_type', p_trigger_type, 'reason', sqlerrm)
    );
    return null;
  end;

  if v_run_id is null then return null; end if;

  for v_action, v_index in
    select action, (ord - 1)::integer
    from jsonb_array_elements(v_actions) with ordinality as t(action, ord)
  loop
    v_type := coalesce(v_action ->> 'type', '');
    v_label := nullif(btrim(coalesce(v_action ->> 'label', '')), '');
    v_config := case when jsonb_typeof(v_action -> 'config') = 'object'
      then v_action -> 'config' else '{}'::jsonb end;

    insert into public.workflow_run_steps (
      tenant_id, run_id, step_index, action_type, action_label,
      status, input, started_at
    ) values (
      p_tenant, v_run_id, v_index, v_type, v_label,
      'running', v_config, now()
    )
    returning id into v_step_id;

    begin
      if v_type = 'create_task' then
        v_title := coalesce(v_label, 'Workflow follow-up');
        if length(v_title) > 200 then v_title := left(v_title, 200); end if;
        v_body := nullif(btrim(coalesce(v_config ->> 'value', '')), '');

        insert into public.tasks (tenant_id, title, description, status, created_by)
        values (p_tenant, v_title, v_body, 'pending', p_actor);

        update public.workflow_run_steps
        set status = 'success', output = jsonb_build_object('task_created', true),
            finished_at = now()
        where id = v_step_id;
        v_done := v_done + 1;

        insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
        values (
          p_tenant, p_actor, 'workflow.task_created', 'workflow_run_step', v_step_id::text,
          jsonb_build_object('run_id', v_run_id, 'workflow_id', p_workflow, 'action_type', v_type)
        );

      elsif v_type = 'notify_team' then
        v_title := coalesce(v_label, 'Workflow notification');
        v_body := nullif(btrim(coalesce(v_config ->> 'value', '')), '');

        for v_recipient in
          select bm.user_id
          from public.business_members bm
          where bm.tenant_id = p_tenant
            and bm.status = 'active'
            and bm.role in ('owner', 'admin', 'manager')
            and (p_actor is null or bm.user_id <> p_actor)
        loop
          insert into public.notifications (
            tenant_id, user_id, notification_type, title, body,
            entity_type, entity_id, delivery_channel, delivery_status
          ) values (
            p_tenant, v_recipient.user_id, 'workflow_notification', v_title, v_body,
            'workflow_run', v_run_id, 'in_app', 'sent'
          );
        end loop;

        update public.workflow_run_steps
        set status = 'success', output = jsonb_build_object('in_app_only', true),
            finished_at = now()
        where id = v_step_id;
        v_done := v_done + 1;

        insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
        values (
          p_tenant, p_actor, 'workflow.team_notified', 'workflow_run_step', v_step_id::text,
          jsonb_build_object('run_id', v_run_id, 'workflow_id', p_workflow, 'action_type', v_type)
        );

      elsif v_type = 'add_tag' then
        -- Only meaningful for a contact source event; never creates a tag.
        if p_source_table = 'contacts' and p_source_id is not null
           and nullif(btrim(coalesce(v_config ->> 'value', '')), '') is not null then
          insert into public.contact_tags (tenant_id, contact_id, tag_id)
          select p_tenant, p_source_id, t.id
          from public.tags t
          where t.tenant_id = p_tenant
            and lower(t.name) = lower(btrim(v_config ->> 'value'))
          on conflict do nothing;
        end if;

        update public.workflow_run_steps
        set status = 'success', output = jsonb_build_object('local_only', true),
            finished_at = now()
        where id = v_step_id;
        v_done := v_done + 1;

      else
        -- webhook_placeholder and send_review_request are intentionally skipped.
        -- Anything unknown is also skipped rather than guessed at.
        update public.workflow_run_steps
        set status = 'skipped', finished_at = now(),
            output = jsonb_build_object(
              'reason', case
                when v_type = 'webhook_placeholder' then 'Provider not configured; no external call made'
                when v_type = 'send_review_request' then 'Handled by the appointment-completed runner only'
                else 'Unsupported local action type'
              end
            )
        where id = v_step_id;
        v_skipped := v_skipped + 1;
      end if;
    exception when others then
      update public.workflow_run_steps
      set status = 'failed', error = left(sqlerrm, 500), finished_at = now()
      where id = v_step_id;
      v_failed := v_failed + 1;
      insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
      values (
        p_tenant, p_actor, 'workflow.step_failed', 'workflow_run_step', v_step_id::text,
        jsonb_build_object('run_id', v_run_id, 'action_type', v_type, 'reason', left(sqlerrm, 300))
      );
    end;
  end loop;

  update public.workflow_runs
  set status = case
        when v_failed > 0 then 'failed'
        when v_done = 0 and v_skipped > 0 then 'skipped'
        else 'success'
      end,
      error = case when v_failed > 0 then format('%s step(s) failed', v_failed) else null end,
      finished_at = now()
  where id = v_run_id;

  update public.workflows
  set run_count = run_count + 1, last_run_at = now()
  where id = p_workflow and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, p_actor, 'workflow.local_actions_executed', 'workflow_run', v_run_id::text,
    jsonb_build_object(
      'workflow_id', p_workflow,
      'trigger_type', p_trigger_type,
      'actions_done', v_done,
      'actions_skipped', v_skipped,
      'actions_failed', v_failed,
      'auto_send', false
    )
  );

  return v_run_id;
end;
$$;

revoke all on function public.workflows_execute_local_actions(uuid, uuid, text, text, uuid, jsonb, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Lead-created trigger (Painter 1 and Painter 5)
-- ---------------------------------------------------------------------------
create or replace function public.workflows_handle_lead_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workflow record;
begin
  if tg_op <> 'INSERT' or new.status <> 'lead' then return new; end if;

  for v_workflow in
    select w.id
    from public.workflows w
    where w.tenant_id = new.tenant_id
      and w.trigger_type = 'lead_created'
      and w.status = 'active'
  loop
    perform public.workflows_execute_local_actions(
      new.tenant_id, v_workflow.id, 'lead_created', 'contacts', new.id,
      jsonb_build_object(
        'contact_id', new.id,
        'source', new.source,
        'name', concat_ws(' ', new.first_name, new.last_name)
      ),
      (select auth.uid())
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists workflows_lead_created_local_runner on public.contacts;
create trigger workflows_lead_created_local_runner
after insert on public.contacts
for each row execute function public.workflows_handle_lead_created();

-- ---------------------------------------------------------------------------
-- 4. Appointment-created trigger (Painter 3)
-- ---------------------------------------------------------------------------
create or replace function public.workflows_handle_appointment_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workflow record;
begin
  if tg_op <> 'INSERT' then return new; end if;

  for v_workflow in
    select w.id
    from public.workflows w
    where w.tenant_id = new.tenant_id
      and w.trigger_type = 'appointment_created'
      and w.status = 'active'
  loop
    perform public.workflows_execute_local_actions(
      new.tenant_id, v_workflow.id, 'appointment_created', 'appointments', new.id,
      jsonb_build_object(
        'appointment_id', new.id,
        'contact_id', new.contact_id,
        'title', new.title,
        'start_at', new.start_at
      ),
      (select auth.uid())
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists workflows_appointment_created_local_runner on public.appointments;
create trigger workflows_appointment_created_local_runner
after insert on public.appointments
for each row execute function public.workflows_handle_appointment_created();

-- ---------------------------------------------------------------------------
-- 5. Manual runner for Painter 2 (and any other active manual workflow)
-- ---------------------------------------------------------------------------
create or replace function public.workflows_run_manual(
  p_tenant uuid,
  p_workflow uuid,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_dedupe text;
  v_source_id uuid;
begin
  if v_actor is null
     or not public.has_tenant_role(p_tenant, array['owner', 'admin', 'manager']) then
    raise exception 'Manager role required to run a workflow manually';
  end if;

  perform 1
  from public.workflows w
  where w.id = p_workflow
    and w.tenant_id = p_tenant
    and w.trigger_type = 'manual'
    and w.status = 'active';
  if not found then raise exception 'Active manual workflow not found'; end if;

  v_dedupe := nullif(btrim(coalesce(p_payload ->> 'dedupe_key', '')), '');
  if v_dedupe is not null and v_dedupe ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_source_id := v_dedupe::uuid;
  end if;

  return public.workflows_execute_local_actions(
    p_tenant, p_workflow, 'manual', 'manual', v_source_id,
    coalesce(p_payload, '{}'::jsonb), v_actor
  );
end;
$$;

revoke all on function public.workflows_run_manual(uuid, uuid, jsonb) from public, anon;
grant execute on function public.workflows_run_manual(uuid, uuid, jsonb) to authenticated;

commit;
