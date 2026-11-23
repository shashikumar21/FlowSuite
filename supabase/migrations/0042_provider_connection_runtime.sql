-- Provider OAuth / direct-connect runtime hardening (LOCAL ONLY).
--
-- Supabase remains the database. This migration does not contact any provider,
-- store raw secrets, deploy an Edge Function, or change hosted state.
--
-- Contract:
-- * Tokens and ciphertext are never exposed to authenticated clients.
-- * Every connection state change is audit logged with metadata only.
-- * Calendar OAuth state is tenant-scoped, short-lived and single-use.
-- * Status reads use has_tenant_access; changes use manager+ where appropriate.
-- * No external message, email, SMS, provider call or auto-send path exists.

begin;

-- ---------------------------------------------------------------------------
-- 1. Safe, unified Supabase status for both OAuth and direct-connect rows.
-- ---------------------------------------------------------------------------

create or replace function public.provider_connections_status(p_tenant uuid)
returns table (
  kind text,
  provider text,
  secret_name text,
  status text,
  display_name text,
  connected boolean,
  identifier text,
  last_error text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_tenant_access(p_tenant) then raise exception 'Access denied'; end if;

  return query
  select * from (
    select
      'oauth'::text as kind,
      'google_calendar'::text as provider,
      'GOOGLE_CALENDAR'::text as secret_name,
      c.status as status,
      'Google Calendar'::text as display_name,
      (c.status = 'connected') as connected,
      c.google_email as identifier,
      c.last_error as last_error,
      c.updated_at as updated_at
    from public.calendar_connections c
    where c.tenant_id = p_tenant and c.provider = 'google'

    union all

    select
      'direct_connect'::text as kind,
      s.provider as provider,
      s.secret_name as secret_name,
      s.status as status,
      s.provider as display_name,
      (s.status = 'connected' and coalesce(s.ciphertext, '') <> '') as connected,
      null::text as identifier,
      s.last_error as last_error,
      s.updated_at as updated_at
    from public.integration_secrets s
    where s.tenant_id = p_tenant
  ) connections
  order by connections.updated_at desc;
end;
$$;

revoke all on function public.provider_connections_status(uuid) from public, anon;
grant execute on function public.provider_connections_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Metadata-only audit trail for provider connection state changes.
--    Never writes access_token, refresh_token, ciphertext or iv.
-- ---------------------------------------------------------------------------

create or replace function public.provider_connection_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_action text;
  v_entity_id text;
  v_metadata jsonb;
begin
  if tg_table_name = 'integration_secrets' then
    if tg_op = 'INSERT' then
      v_tenant := new.tenant_id;
      v_entity_id := new.id::text;
      if new.status <> 'connected' then return null; end if;
      v_action := 'provider_connection.vault_connected';
    elsif tg_op = 'UPDATE' then
      v_tenant := new.tenant_id;
      v_entity_id := new.id::text;
      if old.status is not distinct from new.status
         and old.last_error is not distinct from new.last_error then
        return null;
      end if;
      v_action := case new.status
        when 'connected' then 'provider_connection.vault_connected'
        when 'disconnected' then 'provider_connection.vault_disconnected'
        else 'provider_connection.vault_error'
      end;
    else
      v_tenant := old.tenant_id;
      v_entity_id := old.id::text;
      if old.status <> 'connected' then return null; end if;
      v_action := 'provider_connection.vault_disconnected';
    end if;

    v_metadata := jsonb_build_object(
      'provider', coalesce(new.provider, old.provider),
      'secret_name', coalesce(new.secret_name, old.secret_name),
      'status', coalesce(new.status, old.status),
      'external_call', false,
      'auto_send', false
    );
  elsif tg_table_name = 'calendar_connections' then
    if tg_op = 'INSERT' then
      v_tenant := new.tenant_id;
      v_entity_id := new.id::text;
      if new.status <> 'connected' then return null; end if;
      v_action := 'provider_connection.google_connected';
    elsif tg_op = 'UPDATE' then
      v_tenant := new.tenant_id;
      v_entity_id := new.id::text;
      if old.status is not distinct from new.status
         and old.sync_enabled is not distinct from new.sync_enabled
         and old.last_error is not distinct from new.last_error then
        return null;
      end if;
      v_action := case new.status
        when 'connected' then 'provider_connection.google_connected'
        when 'disconnected' then 'provider_connection.google_disconnected'
        else 'provider_connection.google_error'
      end;
    else
      v_tenant := old.tenant_id;
      v_entity_id := old.id::text;
      if old.status <> 'connected' then return null; end if;
      v_action := 'provider_connection.google_disconnected';
    end if;

    v_metadata := jsonb_build_object(
      'provider', coalesce(new.provider, old.provider),
      'status', coalesce(new.status, old.status),
      'sync_enabled', coalesce(new.sync_enabled, old.sync_enabled, false),
      'external_call', false,
      'auto_send', false
    );
  else
    return null;
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_tenant, null, v_action, 'provider_connection', v_entity_id, v_metadata);

  return null;
end;
$$;

revoke all on function public.provider_connection_audit() from public, anon, authenticated;

drop trigger if exists provider_connection_audit on public.integration_secrets;
create trigger provider_connection_audit
  after insert or update or delete on public.integration_secrets
  for each row execute function public.provider_connection_audit();

drop trigger if exists provider_connection_audit on public.calendar_connections;
create trigger provider_connection_audit
  after insert or update or delete on public.calendar_connections
  for each row execute function public.provider_connection_audit();

-- ---------------------------------------------------------------------------
-- 3. Tenant-scoped, single-use OAuth state storage.
--    The current deployed Edge Function still uses signed state; consuming this
--    table requires a future, explicitly approved function change/deploy.
-- ---------------------------------------------------------------------------

create table if not exists public.oauth_connection_states (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null check (provider in ('google_calendar')),
  state_token text not null unique check (length(state_token) >= 32),
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_path text not null default '/app/booking/calendar'
    check (redirect_path in ('/app/booking/calendar', '/app/ai-console/integrations')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint oauth_connection_states_expiry_check check (expires_at > created_at)
);

create index if not exists oauth_connection_states_tenant_idx
  on public.oauth_connection_states(tenant_id, created_at desc);
create index if not exists oauth_connection_states_lookup_idx
  on public.oauth_connection_states(tenant_id, provider, state_token)
  where used_at is null;

alter table public.oauth_connection_states enable row level security;
revoke all on public.oauth_connection_states from public, anon, authenticated;

create or replace function public.oauth_state_create(
  p_tenant uuid,
  p_provider text default 'google_calendar',
  p_redirect_path text default '/app/booking/calendar'
)
returns table (state_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state_id uuid;
  v_token text;
  v_expires_at timestamptz;
begin
  if not public.has_tenant_access(p_tenant) then raise exception 'Access denied'; end if;
  if not public.has_tenant_role(p_tenant, array['owner','admin','manager']) then raise exception 'Insufficient role'; end if;
  if p_provider <> 'google_calendar' then raise exception 'Unsupported provider'; end if;
  if p_redirect_path not in ('/app/booking/calendar', '/app/ai-console/integrations') then
    raise exception 'Invalid redirect path';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expires_at := now() + interval '10 minutes';

  insert into public.oauth_connection_states as s
    (tenant_id, provider, state_token, user_id, redirect_path, expires_at)
  values
    (p_tenant, p_provider, v_token, auth.uid(), p_redirect_path, v_expires_at)
  returning s.id, s.state_token, s.expires_at into v_state_id, v_token, v_expires_at;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, auth.uid(), 'oauth.state_issued', 'oauth_connection_state', v_state_id::text,
    jsonb_build_object('provider', p_provider, 'redirect_path', p_redirect_path, 'external_call', false)
  );

  return query select v_token, v_expires_at;
end;
$$;

create or replace function public.oauth_state_consume(
  p_tenant uuid,
  p_state_token text,
  p_provider text default 'google_calendar',
  p_user_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  v_role text := current_setting('request.jwt.claim.role', true);
  v_state_id uuid;
  v_owner uuid;
begin
  if nullif(btrim(coalesce(p_state_token, '')), '') is null then raise exception 'State token required'; end if;
  if p_provider <> 'google_calendar' then raise exception 'Unsupported provider'; end if;

  if v_role <> 'service_role' then
    if v_caller is null or not public.has_tenant_access(p_tenant) then raise exception 'Access denied'; end if;
    if not public.has_tenant_role(p_tenant, array['owner','admin','manager']) then raise exception 'Insufficient role'; end if;
  end if;

  select id, user_id
  into v_state_id, v_owner
  from public.oauth_connection_states
  where tenant_id = p_tenant
    and provider = p_provider
    and state_token = p_state_token
    and used_at is null
    and expires_at > now()
  order by created_at desc
  for update skip locked
  limit 1;

  if not found then return false; end if;

  if v_role <> 'service_role' and v_owner <> v_caller then raise exception 'State owner mismatch'; end if;
  if p_user_id is not null and v_owner <> p_user_id then raise exception 'State owner mismatch'; end if;

  update public.oauth_connection_states
  set used_at = now()
  where id = v_state_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, null, 'oauth.state_consumed', 'oauth_connection_state', v_state_id::text,
    jsonb_build_object('provider', p_provider, 'user_id', v_owner, 'external_call', false)
  );

  return true;
end;
$$;

revoke all on function public.oauth_state_create(uuid, text, text) from public, anon;
revoke all on function public.oauth_state_consume(uuid, text, text, uuid) from public, anon;
grant execute on function public.oauth_state_create(uuid, text, text) to authenticated;
grant execute on function public.oauth_state_consume(uuid, text, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Align calendar disconnect with the documented can_manage_bookings gate.
--    Trigger above records the status change; no token is returned or logged.
-- ---------------------------------------------------------------------------

create or replace function public.calendar_connection_disconnect(p_tenant uuid, p_provider text default 'google')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_bookings(p_tenant) then
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

revoke all on function public.calendar_connection_disconnect(uuid, text) from public, anon;
grant execute on function public.calendar_connection_disconnect(uuid, text) to authenticated;

commit;
