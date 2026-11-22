-- Workflows v1: workflow definitions shell (no execution engine).
-- NEW FILE ONLY — LOCAL ONLY — not applied to hosted until explicit approval.
--
-- Contract:
-- * Browser code has SELECT only. Writes go through SECURITY DEFINER RPCs.
-- * No workflow execution, no external sends, no webhooks fired by this migration.
-- * Actions/conditions are stored as validated JSON definitions for a future runner.

begin;

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text,
  trigger_type text not null check (trigger_type in (
    'appointment_created','appointment_cancelled','appointment_rescheduled',
    'lead_created','contact_created','manual'
  )),
  trigger_config jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','active','paused')),
  run_count integer not null default 0 check (run_count >= 0),
  last_run_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger workflows_set_updated_at
  before update on public.workflows
  for each row execute function public.set_updated_at();

create index if not exists workflows_tenant_idx on public.workflows(tenant_id, updated_at desc);

alter table public.workflows enable row level security;

drop policy if exists "workflows_select" on public.workflows;
create policy "workflows_select"
  on public.workflows for select to authenticated
  using (public.has_tenant_access(tenant_id));

revoke all on public.workflows from public, anon, authenticated;
grant select on public.workflows to authenticated;

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
  if p_trigger_type not in ('appointment_created','appointment_cancelled','appointment_rescheduled','lead_created','contact_created','manual') then
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
  if p_trigger_type not in ('appointment_created','appointment_cancelled','appointment_rescheduled','lead_created','contact_created','manual') then
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

create or replace function public.workflows_set_status(
  p_tenant uuid,
  p_workflow uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_tenant_access(p_tenant) then raise exception 'Access denied'; end if;
  if p_status not in ('draft','active','paused') then raise exception 'Invalid status'; end if;
  update public.workflows set status = p_status, updated_at = now()
  where id = p_workflow and tenant_id = p_tenant;
  if not found then raise exception 'Workflow not found'; end if;
end;
$$;

create or replace function public.workflows_delete(
  p_tenant uuid,
  p_workflow uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_tenant_role(p_tenant, array['owner','admin']) then raise exception 'Access denied'; end if;
  delete from public.workflows where id = p_workflow and tenant_id = p_tenant;
  if not found then raise exception 'Workflow not found'; end if;
end;
$$;

revoke all on function public.workflows_create(uuid,text,text,text,jsonb,jsonb,text) from public, anon;
revoke all on function public.workflows_update(uuid,uuid,text,text,text,jsonb,jsonb,text) from public, anon;
revoke all on function public.workflows_set_status(uuid,uuid,text) from public, anon;
revoke all on function public.workflows_delete(uuid,uuid) from public, anon;
grant execute on function public.workflows_create(uuid,text,text,text,jsonb,jsonb,text) to authenticated;
grant execute on function public.workflows_update(uuid,uuid,text,text,text,jsonb,jsonb,text) to authenticated;
grant execute on function public.workflows_set_status(uuid,uuid,text) to authenticated;
grant execute on function public.workflows_delete(uuid,uuid) to authenticated;

commit;
