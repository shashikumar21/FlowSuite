-- AI Sales Agent Phase 2 follow-up: convert a prospect into a real CRM contact.
--
-- Contract:
-- * Tenant identity is always checked from the authenticated membership.
-- * Browser code cannot write contacts or prospects directly; it calls this
--   SECURITY DEFINER RPC, which delegates creation to the existing
--   public.create_contact RPC so CRM validation, assignment rules, activity
--   logging and audit logging stay in one place.
-- * Idempotent: a prospect already converted returns its linked contact.
-- * Duplicate-safe: if the tenant already has a contact with the prospect's
--   email, that contact is linked instead of creating a second record.
-- * Supabase grants EXECUTE to anon by default on new functions, so revoke
--   anon explicitly rather than relying on REVOKE FROM PUBLIC.
--
-- Forward-only schema correction: 0017 declared
--   FOREIGN KEY (tenant_id, converted_contact_id) REFERENCES contacts(id, tenant_id)
-- which pairs the referencing columns with the referenced columns in the wrong
-- order, so setting converted_contact_id always failed. Recreate it with the
-- correct column order. This runs on fresh installs after 0017 and patches the
-- hosted database, which already has 0017 applied.

alter table public.prospects
  drop constraint if exists prospects_tenant_id_converted_contact_id_fkey;

alter table public.prospects
  add constraint prospects_tenant_id_converted_contact_id_fkey
  foreign key (tenant_id, converted_contact_id)
  references public.contacts(tenant_id, id)
  on delete set null;

create or replace function public.sales_convert_prospect_to_contact(
  p_tenant uuid,
  p_prospect uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_prospect public.prospects%rowtype;
  v_contact_id uuid;
  v_linked_existing boolean := false;
  v_first_name text;
  v_notes text;
  v_lead_status text;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;
  if not public.has_tenant_access(p_tenant) then
    raise exception 'No access to this business';
  end if;

  select * into v_prospect
  from public.prospects
  where id = p_prospect and tenant_id = p_tenant
  for update;
  if not found then
    raise exception 'Prospect not found';
  end if;

  -- Idempotency: never create a second contact for an already converted lead.
  if v_prospect.converted_contact_id is not null then
    select c.id into v_contact_id
    from public.contacts c
    where c.id = v_prospect.converted_contact_id and c.tenant_id = p_tenant;
    if found then
      return v_contact_id;
    end if;
    -- The linked contact was removed; allow a fresh conversion below.
  end if;

  -- Reuse an existing CRM contact with the same email instead of duplicating it.
  if v_prospect.email is not null and btrim(v_prospect.email) <> '' then
    select c.id into v_contact_id
    from public.contacts c
    where c.tenant_id = p_tenant
      and lower(c.email) = lower(btrim(v_prospect.email))
    order by c.created_at desc
    limit 1;
    if found then
      v_linked_existing := true;
    end if;
  end if;

  v_first_name := nullif(btrim(coalesce(v_prospect.contact_person, '')), '');
  if v_first_name is null then
    v_first_name := btrim(v_prospect.business_name);
  end if;

  v_lead_status := case
    when v_prospect.lead_status in ('new', 'contacted', 'qualified', 'unqualified', 'converted')
      then v_prospect.lead_status
    else 'new'
  end;

  v_notes := concat_ws(
    E'\n',
    'Converted from Sales Agent prospect: ' || v_prospect.business_name,
    nullif(btrim(coalesce(v_prospect.notes, '')), '')
  );

  if not v_linked_existing then
    v_contact_id := public.create_contact(
      p_tenant => p_tenant,
      p_first_name => v_first_name,
      p_last_name => null,
      p_email => nullif(btrim(coalesce(v_prospect.email, '')), ''),
      p_phone => nullif(btrim(coalesce(v_prospect.phone, '')), ''),
      p_company => btrim(v_prospect.business_name),
      p_source => 'sales_agent',
      p_source_id => null,
      p_notes => v_notes,
      p_assigned_to => v_prospect.assigned_to,
      p_lead_status => v_lead_status,
      p_area => nullif(btrim(coalesce(v_prospect.city, '')), ''),
      p_why_included => nullif(btrim(coalesce(v_prospect.notes, '')), '')
    );
  else
    insert into public.contact_activities (tenant_id, contact_id, type, subject, body, created_by, metadata)
    values (
      p_tenant, v_contact_id, 'note', 'Linked from Sales Agent prospect', v_notes, v_caller,
      jsonb_build_object(
        'prospect_id', v_prospect.id,
        'business_name', v_prospect.business_name,
        'source', 'sales_agent'
      )
    );
  end if;

  update public.prospects
  set lead_status = 'converted',
      converted_at = now(),
      converted_contact_id = v_contact_id,
      updated_at = now()
  where id = v_prospect.id and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_caller, 'sales.prospect_converted_to_contact', 'prospect', v_prospect.id::text,
    jsonb_build_object(
      'contact_id', v_contact_id,
      'reused_existing_contact', v_linked_existing
    )
  );

  return v_contact_id;
end;
$$;

comment on function public.sales_convert_prospect_to_contact(uuid, uuid) is
  'Convert a tenant prospect into a CRM contact, reusing an existing email match. Idempotent and audited.';

revoke all on function public.sales_convert_prospect_to_contact(uuid, uuid) from public, anon;
grant execute on function public.sales_convert_prospect_to_contact(uuid, uuid) to authenticated;
