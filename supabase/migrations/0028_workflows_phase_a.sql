-- Workflows Phase A MVP: run logs + step logs. No execution engine beyond
-- explicit runner invocation. LOCAL ONLY until explicit approval.
--
-- Contract:
-- * Browser reads run/step logs via SELECT (tenant-scoped RLS).
-- * Writes happen via service role in workflow-runner Edge Function.
-- * No external sends/webhooks executed.

begin;

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  trigger_type text not null,
  trigger_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','running','success','failed','skipped')),
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.workflow_run_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  step_index integer not null check (step_index >= 0),
  action_type text not null,
  action_label text,
  status text not null default 'pending' check (status in ('pending','running','success','failed','skipped')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists workflow_runs_tenant_idx on public.workflow_runs(tenant_id, created_at desc);
create index if not exists workflow_runs_workflow_idx on public.workflow_runs(workflow_id, created_at desc);
create index if not exists workflow_run_steps_run_idx on public.workflow_run_steps(run_id, step_index asc);

alter table public.workflow_runs enable row level security;
alter table public.workflow_run_steps enable row level security;

drop policy if exists "workflow_runs_select" on public.workflow_runs;
create policy "workflow_runs_select" on public.workflow_runs for select to authenticated
  using (public.has_tenant_access(tenant_id));

drop policy if exists "workflow_run_steps_select" on public.workflow_run_steps;
create policy "workflow_run_steps_select" on public.workflow_run_steps for select to authenticated
  using (public.has_tenant_access(tenant_id));

revoke all on public.workflow_runs, public.workflow_run_steps from public, anon, authenticated;
grant select on public.workflow_runs, public.workflow_run_steps to authenticated;

commit;
