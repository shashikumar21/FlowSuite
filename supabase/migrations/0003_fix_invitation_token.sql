-- Hotfix: invitation tokens must not depend on pgcrypto being present on the
-- pinned search_path of a security definer function. pgcrypto lives in the
-- `extensions` schema on Supabase, so `gen_random_bytes()` was unresolvable
-- inside create_business_invitation() (search_path = ''). Use the built-in
-- gen_random_uuid() instead; it is available from pg_catalog with any search_path.

alter table public.business_invitations
  alter column token set default replace(gen_random_uuid()::text, '-', '');

create or replace function public.create_business_invitation(
  p_tenant_id uuid,
  p_email text,
  p_role text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_caller uuid := (select auth.uid());
begin
  if not public.has_tenant_role(p_tenant_id, array['owner', 'admin']) then
    raise exception 'Only owners and admins can invite team members';
  end if;
  if p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Invalid email address';
  end if;
  if p_role not in ('admin', 'manager', 'employee') then
    raise exception 'Invalid role';
  end if;

  insert into public.business_invitations (tenant_id, email, role, invited_by, expires_at)
  values (p_tenant_id, lower(btrim(p_email)), p_role, v_caller, now() + interval '7 days')
  on conflict (tenant_id, email) do update
    set role = excluded.role,
        token = replace(gen_random_uuid()::text, '-', ''),
        invited_by = excluded.invited_by,
        expires_at = excluded.expires_at,
        accepted_at = null,
        created_at = now()
  returning token into v_token;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant_id, v_caller, 'invitation.created', 'invitation', v_token, jsonb_build_object('role', p_role));

  return v_token;
end;
$$;

revoke all on function public.create_business_invitation(uuid, text, text) from public;
grant execute on function public.create_business_invitation(uuid, text, text) to authenticated;
