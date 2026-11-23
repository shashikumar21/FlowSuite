-- Fix workflows_create/update RPCs to allow appointment_completed trigger type.
-- 0029 added appointment_completed to table CHECK constraint but RPC validation was not updated.

begin;

create or replace function public.workflows_create(
  p_tenant uuid,
  p_name text,
  p_description text default null,
  p_trigger_type text default 'manual',
  p_trigger_config jsonb default '{}'::jsonb,
  p_actions jsonb default '[]'::jsonb,
  p_status text default 'draft'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.has_tenant_access(p_tenant) then raise exception 'Access denied'; end if;
  if p_trigger_type not in ('appointment_created','appointment_completed','appointment_cancelled','appointment_rescheduled','lead_created','contact_created','manual') then
    raise exception 'Invalid trigger type';
  end if;
  if p_status not in ('draft','active','paused') then raise exception 'Invalid status'; end if;
  if jsonb_typeof(coalesce(p_actions,'[]'::jsonb)) <> 'array' then raise exception 'Actions must be an array'; end if;

  insert into public.workflows (tenant_id, name, description, trigger_type, trigger_config, actions, status, created_by)
  values (p_tenant, btrim(p_name), nullif(btrim(coalesce(p_description,'')),''), p_trigger_type, coalesce(p_trigger_config,'{}'::jsonb), coalesce(p_actions,'[]'::jsonb), p_status, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.workflows_update(
  p_tenant uuid,
  p_workflow uuid,
  p_name text,
  p_description text default null,
  p_trigger_type text default 'manual',
  p_trigger_config jsonb default '{}'::jsonb,
  p_actions jsonb default '[]'::jsonb,
  p_status text default 'draft'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_tenant_access(p_tenant) then raise exception 'Access denied'; end if;
  if p_trigger_type not in ('appointment_created','appointment_completed','appointment_cancelled','appointment_rescheduled','lead_created','contact_created','manual') then
    raise exception 'Invalid trigger type';
  end if;
  if p_status not in ('draft','active','paused') then raise exception 'Invalid status'; end if;
  if jsonb_typeof(coalesce(p_actions,'[]'::jsonb)) <> 'array' then raise exception 'Actions must be an array'; end if;

  update public.workflows
  set name = btrim(p_name),
      description = nullif(btrim(coalesce(p_description,'')),''),
      trigger_type = p_trigger_type,
      trigger_config = coalesce(p_trigger_config,'{}'::jsonb),
      actions = coalesce(p_actions,'[]'::jsonb),
      status = p_status,
      updated_at = now()
  where id = p_workflow and tenant_id = p_tenant;
  if not found then raise exception 'Workflow not found'; end if;
end;
$$;

revoke all on function public.workflows_create(uuid,text,text,text,jsonb,jsonb,text) from public, anon;
revoke all on function public.workflows_update(uuid,uuid,text,text,text,jsonb,jsonb,text) from public, anon;
grant execute on function public.workflows_create(uuid,text,text,text,jsonb,jsonb,text) to authenticated;
grant execute on function public.workflows_update(uuid,uuid,text,text,text,jsonb,jsonb,text) to authenticated;

commit;