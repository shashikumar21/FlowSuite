-- Workflows review-request outbox (Phase A extension). SAFE: no auto-send.
-- LOCAL ONLY until explicit approval.
--
-- Adds appointment_completed trigger support and a pending review request outbox.
-- Actual WhatsApp/SMS/email sending is NOT implemented.

begin;

-- Allow appointment_completed trigger on existing workflows table (0027 constraint was inline).
do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'workflows' and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%trigger_type%'
  loop
    execute format('alter table public.workflows drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.workflows
  add constraint workflows_trigger_type_check check (trigger_type in (
    'appointment_created','appointment_completed','appointment_cancelled','appointment_rescheduled',
    'lead_created','contact_created','manual'
  ));

create table if not exists public.review_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  workflow_id uuid references public.workflows(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  customer_name text,
  customer_phone text,
  customer_email text,
  channel text not null check (channel in ('whatsapp','sms','email')),
  review_link_type text not null default 'flowsuite' check (review_link_type in ('flowsuite','google','custom')),
  review_url text,
  message_template text,
  status text not null default 'pending_approval' check (status in ('pending_approval','approved','sent','cancelled','failed')),
  scheduled_for timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger review_requests_set_updated_at
  before update on public.review_requests
  for each row execute function public.set_updated_at();

create index if not exists review_requests_tenant_idx on public.review_requests(tenant_id, created_at desc);
create index if not exists review_requests_status_idx on public.review_requests(tenant_id, status, scheduled_for);

alter table public.review_requests enable row level security;

drop policy if exists "review_requests_select" on public.review_requests;
create policy "review_requests_select" on public.review_requests for select to authenticated
  using (public.has_tenant_access(tenant_id));

revoke all on public.review_requests from public, anon, authenticated;
grant select on public.review_requests to authenticated;

commit;
