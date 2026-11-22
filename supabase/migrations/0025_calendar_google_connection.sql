-- Google Calendar connection (Phase 1 MVP): one connection per business.
-- NEW FILE ONLY — LOCAL ONLY — not applied to hosted until explicit approval.
--
-- Contract:
-- * Tokens are server-side only. No SELECT policy exposes token columns to
--   authenticated clients. Edge Functions use service role for token IO.
-- * Authenticated clients get safe status via calendar_connection_status RPC.
-- * Disconnect is an authenticated RPC (owner/admin/manager via can_manage_booking).
-- * No sync/webhook logic in Phase 1; schema supports Phase 2 FlowSuite -> Google.

begin;

create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null check (provider in ('google')),
  google_email text,
  calendar_id text not null default 'primary',
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scope text,
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'error')),
  sync_enabled boolean not null default false,
  last_synced_at timestamptz,
  last_error text,
  connected_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

create trigger calendar_connections_set_updated_at
  before update on public.calendar_connections
  for each row execute function public.set_updated_at();

create index if not exists calendar_connections_tenant_idx on public.calendar_connections(tenant_id, provider);

alter table public.calendar_connections enable row level security;
-- No SELECT/INSERT/UPDATE/DELETE policies for authenticated: tokens must never be exposed.
revoke all on public.calendar_connections from public, anon, authenticated;

-- Safe status for UI (no tokens).
create or replace function public.calendar_connection_status(p_tenant uuid, p_provider text default 'google')
returns table (
  connected boolean,
  provider text,
  google_email text,
  calendar_id text,
  status text,
  sync_enabled boolean,
  last_synced_at timestamptz,
  last_error text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_tenant_access(p_tenant) then
    raise exception 'Access denied';
  end if;
  if p_provider <> 'google' then
    raise exception 'Unsupported provider';
  end if;
  return query
  select
    (c.status = 'connected') as connected,
    c.provider,
    c.google_email,
    c.calendar_id,
    c.status,
    c.sync_enabled,
    c.last_synced_at,
    c.last_error,
    c.updated_at
  from public.calendar_connections c
  where c.tenant_id = p_tenant and c.provider = p_provider
  limit 1;
end;
$$;

-- Disconnect (owner/admin/manager). Tokens are cleared; row kept for status/history.
create or replace function public.calendar_connection_disconnect(p_tenant uuid, p_provider text default 'google')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_tenant_role(p_tenant, array['owner','admin','manager']) then
    raise exception 'Access denied';
  end if;
  if p_provider <> 'google' then
    raise exception 'Unsupported provider';
  end if;
  update public.calendar_connections
  set status = 'disconnected',
      access_token = null,
      refresh_token = null,
      token_expires_at = null,
      scope = null,
      sync_enabled = false,
      last_error = null,
      google_email = null,
      calendar_id = 'primary',
      updated_at = now()
  where tenant_id = p_tenant and provider = p_provider;
end;
$$;

revoke all on function public.calendar_connection_status(uuid, text) from public, anon;
revoke all on function public.calendar_connection_disconnect(uuid, text) from public, anon;
grant execute on function public.calendar_connection_status(uuid, text) to authenticated;
grant execute on function public.calendar_connection_disconnect(uuid, text) to authenticated;

commit;
