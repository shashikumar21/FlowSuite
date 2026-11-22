-- Tasks module: extend the existing public.tasks table with trusted RPC writes.
-- NEW FILE ONLY — no earlier migration is edited. LOCAL ONLY — not applied to
-- the hosted project.
--
-- Contract:
-- * public.tasks already exists in 0001_core_foundation.sql and is reused as-is.
--   Only additive actor/completion columns are introduced here.
-- * Browser code has SELECT only on tenant-owned tasks. Every write is a
--   SECURITY DEFINER RPC that checks has_tenant_access() first.
-- * A task owner must be an active member of the same tenant. That check is
--   repeated server-side; the UI dropdown is only a convenience.
-- * Completion state (status, completed_by, completed_at) is stamped by the
--   RPC. A client cannot send an actor identity or a completion timestamp.
-- * Destructive deletes require can_manage_sales_agent() (owner/admin).
-- * No notification provider, scheduler, email, SMS or invented metric exists.

begin;

-- ---------------------------------------------------------------------------
-- 1. Additive columns on the existing table
-- ---------------------------------------------------------------------------

alter table public.tasks add column if not exists created_by uuid;
alter table public.tasks add column if not exists completed_by uuid;
alter table public.tasks add column if not exists completed_at timestamptz;

alter table public.tasks add constraint tasks_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.tasks add constraint tasks_completed_by_fkey
  foreign key (completed_by) references public.profiles(id) on delete set null;

-- Backfill legacy completed rows so the new consistency check can be added
-- without discarding existing history. The actor is unknown for old rows.
update public.tasks
set completed_at = coalesce(updated_at, created_at, now())
where status = 'completed' and completed_at is null;

alter table public.tasks add constraint tasks_completed_at_check check (
  (status = 'completed' and completed_at is not null)
  or (status <> 'completed' and completed_at is null)
);

-- ---------------------------------------------------------------------------
-- 2. RLS and grants — read only for the browser
-- ---------------------------------------------------------------------------

drop policy if exists "Tenant tasks access" on public.tasks;

create policy "Tasks: read tenant tasks" on public.tasks
  for select to authenticated using (public.has_tenant_access(tenant_id));

revoke all on public.tasks from public, anon, authenticated;
grant select on public.tasks to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Create and update (no status, actor or timestamp is accepted)
-- ---------------------------------------------------------------------------

create or replace function public.tasks_create_task(
  p_tenant uuid,
  p_title text,
  p_description text,
  p_assigned_to uuid,
  p_due_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_id uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 200 then
    raise exception 'Invalid task title';
  end if;
  if length(btrim(coalesce(p_description, ''))) > 4000 then
    raise exception 'Task description is too long';
  end if;
  if p_assigned_to is not null and not exists (
    select 1 from public.business_members bm
    where bm.tenant_id = p_tenant
      and bm.user_id = p_assigned_to
      and bm.status = 'active'
  ) then
    raise exception 'Assignee is not an active member of this business';
  end if;

  insert into public.tasks (
    tenant_id, title, description, assigned_to, due_at, status, created_by
  ) values (
    p_tenant, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''),
    p_assigned_to, p_due_at, 'pending', v_caller
  ) returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'tasks.task_created', 'task', v_id::text,
    jsonb_build_object('status', 'pending', 'has_assignee', p_assigned_to is not null));
  return v_id;
end;
$$;

create or replace function public.tasks_update_task(
  p_tenant uuid,
  p_task uuid,
  p_title text,
  p_description text,
  p_assigned_to uuid,
  p_due_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 200 then
    raise exception 'Invalid task title';
  end if;
  if length(btrim(coalesce(p_description, ''))) > 4000 then
    raise exception 'Task description is too long';
  end if;
  if p_assigned_to is not null and not exists (
    select 1 from public.business_members bm
    where bm.tenant_id = p_tenant
      and bm.user_id = p_assigned_to
      and bm.status = 'active'
  ) then
    raise exception 'Assignee is not an active member of this business';
  end if;
  if not exists (select 1 from public.tasks t where t.id = p_task and t.tenant_id = p_tenant) then
    raise exception 'Task not found in this business';
  end if;

  update public.tasks
  set title = btrim(p_title),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      assigned_to = p_assigned_to,
      due_at = p_due_at
  where id = p_task and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'tasks.task_updated', 'task', p_task::text,
    jsonb_build_object('has_assignee', p_assigned_to is not null));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Status transitions — completion is stamped by the server
-- ---------------------------------------------------------------------------

create or replace function public.tasks_set_status(
  p_tenant uuid,
  p_task uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_previous text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if coalesce(p_status, '') not in ('pending', 'in_progress', 'completed') then
    raise exception 'Invalid task status';
  end if;

  select t.status into v_previous
  from public.tasks t
  where t.id = p_task and t.tenant_id = p_tenant;
  if not found then raise exception 'Task not found in this business'; end if;

  if p_status = 'completed' then
    update public.tasks
    set status = p_status, completed_by = v_caller, completed_at = now()
    where id = p_task and tenant_id = p_tenant;
  else
    update public.tasks
    set status = p_status, completed_by = null, completed_at = null
    where id = p_task and tenant_id = p_tenant;
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'tasks.status_changed', 'task', p_task::text,
    jsonb_build_object('from', v_previous, 'to', p_status));
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Delete — owner/admin only, checked again on the server
-- ---------------------------------------------------------------------------

create or replace function public.tasks_delete_task(p_tenant uuid, p_task uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if not public.can_manage_sales_agent(p_tenant) then
    raise exception 'Only an owner or admin can delete a task';
  end if;
  if not exists (select 1 from public.tasks t where t.id = p_task and t.tenant_id = p_tenant) then
    raise exception 'Task not found in this business';
  end if;

  delete from public.tasks where id = p_task and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'tasks.task_deleted', 'task', p_task::text, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants — Supabase grants anon EXECUTE by default on new functions
-- ---------------------------------------------------------------------------

revoke all on function public.tasks_create_task(uuid, text, text, uuid, timestamptz) from public, anon;
grant execute on function public.tasks_create_task(uuid, text, text, uuid, timestamptz) to authenticated;

revoke all on function public.tasks_update_task(uuid, uuid, text, text, uuid, timestamptz) from public, anon;
grant execute on function public.tasks_update_task(uuid, uuid, text, text, uuid, timestamptz) to authenticated;

revoke all on function public.tasks_set_status(uuid, uuid, text) from public, anon;
grant execute on function public.tasks_set_status(uuid, uuid, text) to authenticated;

revoke all on function public.tasks_delete_task(uuid, uuid) from public, anon;
grant execute on function public.tasks_delete_task(uuid, uuid) to authenticated;

commit;
