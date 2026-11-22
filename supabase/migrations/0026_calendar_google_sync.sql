-- Google Calendar Phase 2 v1: FlowSuite -> Google appointment sync mapping.
-- NEW FILE ONLY — LOCAL ONLY — not applied to hosted until explicit approval.
--
-- Contract:
-- * One mapping per appointment/provider. Edge Function (service role) writes it.
-- * Authenticated tenant members may SELECT mappings for status/debug; no tokens.
-- * Sync is best-effort and idempotent via google_event_id mapping.

begin;

create table if not exists public.calendar_event_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  provider text not null check (provider in ('google')),
  google_event_id text,
  sync_status text not null default 'pending' check (sync_status in ('pending', 'synced', 'error', 'skipped', 'cancelled')),
  last_error text,
  last_synced_at timestamptz,
  payload_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, provider)
);

create trigger calendar_event_mappings_set_updated_at
  before update on public.calendar_event_mappings
  for each row execute function public.set_updated_at();

create index if not exists calendar_event_mappings_tenant_idx
  on public.calendar_event_mappings(tenant_id, provider, updated_at desc);
create index if not exists calendar_event_mappings_appointment_idx
  on public.calendar_event_mappings(appointment_id, provider);

alter table public.calendar_event_mappings enable row level security;

drop policy if exists "calendar_event_mappings_select" on public.calendar_event_mappings;
create policy "calendar_event_mappings_select"
  on public.calendar_event_mappings for select to authenticated
  using (public.has_tenant_access(tenant_id));

revoke all on public.calendar_event_mappings from public, anon, authenticated;
grant select on public.calendar_event_mappings to authenticated;

commit;
