-- Extend channel credential provider support for website direct deploy.
-- LOCAL ONLY until explicit approval. No secrets stored; secret_ref name only.

begin;

-- Extend provider check constraint on channel_credentials.
do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'channel_credentials' and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%provider%'
  loop
    execute format('alter table public.channel_credentials drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.channel_credentials
  add constraint channel_credentials_provider_check
  check (provider in ('whatsapp', 'openai', 'resend', 'exotel', 'netlify', 'vercel', 'other'));

-- Update RPC to accept deploy providers. Keeps signature; create or replace preserves grants.
create or replace function public.ai_upsert_credential(
  p_tenant uuid,
  p_channel uuid,
  p_provider text,
  p_secret_ref text,
  p_external_identifier text default null,
  p_scopes jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.can_manage_ai(p_tenant) then
    raise exception 'Not allowed to manage provider connections';
  end if;
  if p_secret_ref is null
    or btrim(p_secret_ref) !~ '^[A-Z][A-Z0-9_]{2,199}$'
    or btrim(p_secret_ref) like 'VITE_%' then
    raise exception 'Invalid server-side secret reference';
  end if;
  if p_provider not in ('whatsapp', 'openai', 'resend', 'exotel', 'netlify', 'vercel', 'other') then
    raise exception 'Unknown provider';
  end if;
  if not exists (
    select 1 from public.channels
    where id = p_channel and tenant_id = p_tenant and active = true
  ) then
    raise exception 'Channel not found';
  end if;

  insert into public.channel_credentials (
    tenant_id, channel_id, provider, secret_ref, external_identifier, scopes, status
  ) values (
    p_tenant, p_channel, p_provider, btrim(p_secret_ref), p_external_identifier,
    coalesce(p_scopes, '[]'::jsonb), 'active'
  )
  on conflict (tenant_id, channel_id, provider)
  do update set secret_ref = excluded.secret_ref,
    external_identifier = excluded.external_identifier,
    scopes = excluded.scopes,
    status = 'active',
    updated_at = now()
  returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'ai.credential_updated', 'channel_credential', v_id::text);
  return v_id;
end;
$$;

commit;
