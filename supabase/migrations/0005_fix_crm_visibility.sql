-- =============================================================================
-- 0005_fix_crm_visibility.sql
-- Corrective migration found by supabase/tests/milestone2_crm.sql.
--
-- The Milestone 2 visibility helpers granted access to unassigned leads (and
-- other CRM rows) without first requiring an active membership in the tenant.
-- Any authenticated user could therefore read unassigned leads from another
-- business. These replacements add the missing membership check. Migrations
-- 0004 and 0005 together describe the final intended schema.
-- =============================================================================

begin;

create or replace function public.can_view_contact(p_tenant uuid, p_contact uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_tenant_access(p_tenant)
    and (
      public.can_manage_crm(p_tenant)
      or exists (
        select 1 from public.contacts c
        where c.tenant_id = p_tenant
          and c.id = p_contact
          and (
            c.assigned_to = (select auth.uid())
            or (c.assigned_to is null and c.status = 'lead')
          )
      )
    );
$$;

create or replace function public.can_edit_contact(p_tenant uuid, p_contact uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_tenant_access(p_tenant)
    and (
      public.can_manage_crm(p_tenant)
      or exists (
        select 1 from public.contacts c
        where c.tenant_id = p_tenant
          and c.id = p_contact
          and c.assigned_to = (select auth.uid())
      )
    );
$$;

create or replace function public.can_view_deal(p_tenant uuid, p_deal uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_tenant_access(p_tenant)
    and (
      public.can_manage_crm(p_tenant)
      or exists (
        select 1 from public.deals d
        where d.tenant_id = p_tenant
          and d.id = p_deal
          and d.assigned_to = (select auth.uid())
      )
    );
$$;

create or replace function public.can_view_activity(p_tenant uuid, p_activity uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return public.has_tenant_access(p_tenant)
    and (
      public.can_manage_crm(p_tenant)
      or exists (
        select 1 from public.contact_activities a
        where a.tenant_id = p_tenant
          and a.id = p_activity
          and (
            a.created_by = (select auth.uid())
            or public.can_view_contact(p_tenant, a.contact_id)
          )
      )
    );
end;
$$;

commit;
