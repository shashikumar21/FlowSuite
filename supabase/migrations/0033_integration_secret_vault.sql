-- Secure integration secret vault (local only, approval-gated).
-- Stores encrypted provider secrets server-side. Plaintext never stored in DB.
-- Encryption/decryption happens in Edge Functions using CREDENTIALS_ENCRYPTION_KEY.
-- Clients can read metadata only (never ciphertext).

begin;

create table if not exists public.integration_secrets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null check (provider in ('openai','whatsapp','resend','exotel','netlify','vercel','other')),
  secret_name text not null check (secret_name ~ '^[A-Z][A-Z0-9_]{2,199}$' and secret_name not like 'VITE_%'),
  ciphertext text not null,
  iv text not null,
  version integer not null default 1,
  status text not null default 'connected' check (status in ('connected','disconnected','error')),
  last_verified_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, secret_name)
);

create trigger integration_secrets_set_updated_at
  before update on public.integration_secrets
  for each row execute function public.set_updated_at();

alter table public.integration_secrets enable row level security;

-- No client select on base table (ciphertext). Metadata exposed via secure view/RPC.
revoke all on public.integration_secrets from public, anon, authenticated;

create or replace view public.integration_secrets_meta as
  select id, tenant_id, provider, secret_name, status, last_verified_at, last_error, created_at, updated_at
  from public.integration_secrets;

revoke all on public.integration_secrets_meta from public, anon;
grant select on public.integration_secrets_meta to authenticated;

-- RLS on underlying table for view owner access is handled by security definer? Views run as owner by default in Postgres.
-- Use a security barrier view? Better: grant select via view and create RLS-safe RPC or set view as security invoker with policy.
-- Simpler: use RPC for metadata.
drop view if exists public.integration_secrets_meta;

create or replace function public.integrations_list_secret_meta(p_tenant uuid)
returns table (
  id uuid,
  provider text,
  secret_name text,
  status text,
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_tenant_access(p_tenant) then raise exception 'Access denied'; end if;
  return query
  select s.id, s.provider, s.secret_name, s.status, s.last_verified_at, s.last_error, s.created_at, s.updated_at
  from public.integration_secrets s
  where s.tenant_id = p_tenant
  order by s.updated_at desc;
end;
$$;

create or replace function public.integrations_disconnect_secret(p_tenant uuid, p_provider text, p_secret_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_tenant_access(p_tenant) then raise exception 'Access denied'; end if;
  if not public.has_tenant_role(p_tenant, array['owner','admin','manager']) then raise exception 'Insufficient role'; end if;
  update public.integration_secrets
  set status = 'disconnected', ciphertext = '', iv = '', updated_at = now(), last_error = null
  where tenant_id = p_tenant and provider = p_provider and secret_name = p_secret_name;
  if not found then raise exception 'Secret not found'; end if;
end;
$$;

revoke all on function public.integrations_list_secret_meta(uuid) from public, anon;
revoke all on function public.integrations_disconnect_secret(uuid,text,text) from public, anon;
grant execute on function public.integrations_list_secret_meta(uuid) to authenticated;
grant execute on function public.integrations_disconnect_secret(uuid,text,text) to authenticated;

commit;
