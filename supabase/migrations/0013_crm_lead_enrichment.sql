-- M3.1 CRM lead enrichment.
--
-- Additive only: nine nullable/defaulted lead columns on public.contacts plus
-- the trusted RPCs that read and write them. No existing column, index, RLS
-- policy or grant is changed. The old function signatures are dropped before
-- recreation because RETURNS TABLE and parameter lists change; grants are
-- re-applied exactly as they were (authenticated only, never anon).
--
-- Deliberate choices:
-- * mobile is canonicalised to +919876543210, but is NOT used by the email /
--   phone dedup checks or the existing phone unique index.
-- * Unparseable mobile values are stored trimmed, never coerced to a number.
-- * sent is coalesced to false so an explicit NULL cannot violate NOT NULL.
-- * Audit-log metadata keeps its original shape; only the richer lead_created
--   activity metadata gains the new values.
-- * Import rows accept friendly header spellings alongside snake_case keys.
--
begin;

-- -----------------------------------------------------------------------------
-- 1. Columns and constraints
-- -----------------------------------------------------------------------------

alter table public.contacts
  add column if not exists clinic text,
  add column if not exists area text,
  add column if not exists mobile text,
  add column if not exists rating numeric(2, 1),
  add column if not exists reviews integer,
  add column if not exists why_included text,
  add column if not exists google_maps_url text,
  add column if not exists sent boolean not null default false,
  add column if not exists reply_1 text;

alter table public.contacts drop constraint if exists contacts_rating_check;
alter table public.contacts add constraint contacts_rating_check
  check (rating is null or (rating >= 0 and rating <= 5));

alter table public.contacts drop constraint if exists contacts_reviews_check;
alter table public.contacts add constraint contacts_reviews_check
  check (reviews is null or reviews >= 0);

-- -----------------------------------------------------------------------------
-- 2. Shared mobile normalisation helper (internal use only)
-- -----------------------------------------------------------------------------

create or replace function public.normalize_lead_mobile(p_mobile text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with d as (
    select btrim(coalesce(p_mobile, '')) as v_raw,
           regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g') as v_digits
  )
  select case
    when v_raw = '' then null
    when length(v_digits) = 10 then '+91' || v_digits
    when length(v_digits) = 12 and left(v_digits, 2) = '91' then '+' || v_digits
    else v_raw
  end
  from d;
$$;

-- SECURITY INVOKER importers call this helper, so authenticated keeps EXECUTE.
revoke all on function public.normalize_lead_mobile(text) from public;
grant execute on function public.normalize_lead_mobile(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. create_contact / update_contact
-- -----------------------------------------------------------------------------

-- Old 11-argument signatures must go: the new ones append nine optional args.
drop function if exists public.create_contact(uuid, text, text, text, text, text, text, uuid, text, uuid, text);
drop function if exists public.update_contact(uuid, uuid, text, text, text, text, text, text, text, timestamptz, text);

create or replace function public.create_contact(
  p_tenant uuid,
  p_first_name text,
  p_last_name text default null,
  p_email text default null,
  p_phone text default null,
  p_company text default null,
  p_source text default null,
  p_source_id uuid default null,
  p_notes text default null,
  p_assigned_to uuid default null,
  p_lead_status text default 'new',
  p_clinic text default null,
  p_area text default null,
  p_mobile text default null,
  p_rating numeric default null,
  p_reviews integer default null,
  p_why_included text default null,
  p_google_maps_url text default null,
  p_sent boolean default false,
  p_reply_1 text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_assigned uuid;
  v_id uuid;
  v_source text := p_source;
  v_mobile text := public.normalize_lead_mobile(p_mobile);
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if coalesce(trim(p_first_name), '') = '' then raise exception 'First name is required'; end if;
  if p_lead_status is null or p_lead_status not in ('new', 'contacted', 'qualified', 'unqualified', 'converted') then
    raise exception 'Invalid lead status';
  end if;

  if p_source_id is not null then
    select ls.name into v_source
    from public.lead_sources ls
    where ls.id = p_source_id and ls.tenant_id = p_tenant and ls.active;
    if not found then raise exception 'Invalid lead source'; end if;
  end if;

  if public.can_manage_crm(p_tenant) then
    v_assigned := p_assigned_to;
  else
    v_assigned := v_caller;
  end if;

  if v_assigned is not null and not public.is_active_member(p_tenant, v_assigned) then
    raise exception 'Assigned user is not an active member of this business';
  end if;

  insert into public.contacts (
    tenant_id, first_name, last_name, email, phone, company, source, source_id,
    notes, status, lead_status, assigned_to,
    clinic, area, mobile, rating, reviews, why_included, google_maps_url, sent, reply_1
  ) values (
    p_tenant, trim(p_first_name), nullif(trim(p_last_name), ''),
    nullif(lower(trim(p_email)), ''), nullif(trim(p_phone), ''),
    nullif(trim(p_company), ''), v_source, p_source_id,
    p_notes, 'lead', p_lead_status, v_assigned,
    nullif(trim(p_clinic), ''), nullif(trim(p_area), ''), v_mobile,
    p_rating, p_reviews, nullif(trim(p_why_included), ''),
    nullif(trim(p_google_maps_url), ''), coalesce(p_sent, false),
    nullif(trim(p_reply_1), '')
  ) returning id into v_id;

  insert into public.contact_activities (tenant_id, contact_id, type, subject, body, created_by, metadata)
  values (p_tenant, v_id, 'lead_created', 'Lead created', p_notes, v_caller,
          jsonb_build_object(
            'source', v_source,
            'lead_status', p_lead_status,
            'clinic', nullif(trim(p_clinic), ''),
            'area', nullif(trim(p_area), ''),
            'mobile', v_mobile,
            'rating', p_rating,
            'reviews', p_reviews,
            'why_included', nullif(trim(p_why_included), ''),
            'google_maps_url', nullif(trim(p_google_maps_url), ''),
            'sent', coalesce(p_sent, false),
            'reply_1', nullif(trim(p_reply_1), '')
          ));

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'contact.created', 'contact', v_id::text,
          jsonb_build_object('source', v_source));

  return v_id;
end;
$$;

create or replace function public.update_contact(
  p_tenant uuid,
  p_contact uuid,
  p_first_name text,
  p_last_name text default null,
  p_email text default null,
  p_phone text default null,
  p_company text default null,
  p_notes text default null,
  p_lead_status text default null,
  p_follow_up_at timestamptz default null,
  p_status text default null,
  p_clinic text default null,
  p_area text default null,
  p_mobile text default null,
  p_rating numeric default null,
  p_reviews integer default null,
  p_why_included text default null,
  p_google_maps_url text default null,
  p_sent boolean default false,
  p_reply_1 text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_old public.contacts%rowtype;
  v_mobile text := public.normalize_lead_mobile(p_mobile);
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.can_edit_contact(p_tenant, p_contact) then raise exception 'Cannot edit this contact'; end if;
  if coalesce(trim(p_first_name), '') = '' then raise exception 'First name is required'; end if;
  if p_lead_status is not null and p_lead_status not in ('new', 'contacted', 'qualified', 'unqualified', 'converted') then
    raise exception 'Invalid lead status';
  end if;
  if p_status is not null and p_status not in ('lead', 'customer', 'inactive') then
    raise exception 'Invalid contact status';
  end if;

  select * into v_old from public.contacts c where c.tenant_id = p_tenant and c.id = p_contact;
  if not found then raise exception 'Contact not found'; end if;

  update public.contacts c
  set first_name = trim(p_first_name),
      last_name = nullif(trim(p_last_name), ''),
      email = nullif(lower(trim(p_email)), ''),
      phone = nullif(trim(p_phone), ''),
      company = nullif(trim(p_company), ''),
      notes = p_notes,
      lead_status = coalesce(p_lead_status, c.lead_status),
      follow_up_at = p_follow_up_at,
      status = coalesce(p_status, c.status),
      converted_at = case when coalesce(p_status, c.status) = 'customer' and c.converted_at is null
                          then now() else c.converted_at end,
      clinic = nullif(trim(p_clinic), ''),
      area = nullif(trim(p_area), ''),
      mobile = v_mobile,
      rating = p_rating,
      reviews = p_reviews,
      why_included = nullif(trim(p_why_included), ''),
      google_maps_url = nullif(trim(p_google_maps_url), ''),
      sent = coalesce(p_sent, false),
      reply_1 = nullif(trim(p_reply_1), '')
  where c.tenant_id = p_tenant and c.id = p_contact;

  if (p_lead_status is not null and p_lead_status is distinct from v_old.lead_status)
     or (p_status is not null and p_status is distinct from v_old.status) then
    insert into public.contact_activities (tenant_id, contact_id, type, subject, created_by, metadata)
    values (p_tenant, p_contact, 'status_change', 'Status updated', v_caller,
            jsonb_build_object('old_lead_status', v_old.lead_status,
                               'new_lead_status', coalesce(p_lead_status, v_old.lead_status),
                               'old_status', v_old.status,
                               'new_status', coalesce(p_status, v_old.status)));
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'contact.updated', 'contact', p_contact::text, '{}'::jsonb);
end;
$$;

revoke all on function public.create_contact(
  uuid, text, text, text, text, text, text, uuid, text, uuid, text,
  text, text, text, numeric, integer, text, text, boolean, text
) from public;
grant execute on function public.create_contact(
  uuid, text, text, text, text, text, text, uuid, text, uuid, text,
  text, text, text, numeric, integer, text, text, boolean, text
) to authenticated;

revoke all on function public.update_contact(
  uuid, uuid, text, text, text, text, text, text, text, timestamptz, text,
  text, text, text, numeric, integer, text, text, boolean, text
) from public;
grant execute on function public.update_contact(
  uuid, uuid, text, text, text, text, text, text, text, timestamptz, text,
  text, text, text, numeric, integer, text, text, boolean, text
) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. crm_search_contacts: same arguments, wider RETURNS TABLE
-- -----------------------------------------------------------------------------

drop function if exists public.crm_search_contacts(uuid, text, text, text, uuid, uuid, uuid, integer, integer);

create or replace function public.crm_search_contacts(
  p_tenant uuid,
  p_query text default null,
  p_status text default null,
  p_lead_status text default null,
  p_source_id uuid default null,
  p_assigned_to uuid default null,
  p_tag_id uuid default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  company text,
  status text,
  lead_status text,
  source_id uuid,
  assigned_to uuid,
  created_at timestamptz,
  total_count bigint,
  clinic text,
  area text,
  mobile text,
  rating numeric,
  reviews integer,
  why_included text,
  google_maps_url text,
  sent boolean,
  reply_1 text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_query text := nullif(trim(coalesce(p_query, '')), '');
begin
  if not public.has_tenant_access(p_tenant) then return; end if;

  return query
  select c.id, c.first_name, c.last_name, c.email, c.phone, c.company,
         c.status, c.lead_status, c.source_id, c.assigned_to, c.created_at,
         count(*) over () as total_count,
         c.clinic, c.area, c.mobile, c.rating, c.reviews, c.why_included,
         c.google_maps_url, c.sent, c.reply_1
  from public.contacts c
  where c.tenant_id = p_tenant
    and public.can_view_contact(p_tenant, c.id)
    and (v_query is null
         or c.first_name ilike '%' || v_query || '%'
         or coalesce(c.last_name, '') ilike '%' || v_query || '%'
         or coalesce(c.email, '') ilike '%' || v_query || '%'
         or coalesce(c.phone, '') ilike '%' || v_query || '%'
         or coalesce(c.company, '') ilike '%' || v_query || '%'
         or coalesce(c.clinic, '') ilike '%' || v_query || '%'
         or coalesce(c.area, '') ilike '%' || v_query || '%'
         or coalesce(c.mobile, '') ilike '%' || v_query || '%'
         or coalesce(c.why_included, '') ilike '%' || v_query || '%'
         or coalesce(c.reply_1, '') ilike '%' || v_query || '%')
    and (p_status is null or c.status = p_status)
    and (p_lead_status is null or c.lead_status = p_lead_status)
    and (p_source_id is null or c.source_id = p_source_id)
    and (p_assigned_to is null or c.assigned_to = p_assigned_to)
    and (p_tag_id is null or exists (
      select 1 from public.contact_tags ct
      where ct.tenant_id = c.tenant_id and ct.contact_id = c.id and ct.tag_id = p_tag_id
    ))
  order by c.created_at desc
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.crm_search_contacts(uuid, text, text, text, uuid, uuid, uuid, integer, integer) from public;
grant execute on function public.crm_search_contacts(uuid, text, text, text, uuid, uuid, uuid, integer, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. crm_export_rows: same arguments, wider RETURNS TABLE
-- -----------------------------------------------------------------------------

drop function if exists public.crm_export_rows(uuid, text, text, text, text, uuid, uuid, uuid, integer);

create or replace function public.crm_export_rows(
  p_tenant uuid,
  p_kind text,
  p_query text default null,
  p_status text default null,
  p_lead_status text default null,
  p_source_id uuid default null,
  p_assigned_to uuid default null,
  p_tag_id uuid default null,
  p_limit integer default 5000
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  company text,
  status text,
  lead_status text,
  source_name text,
  owner_name text,
  tags text,
  notes text,
  custom_data jsonb,
  created_at timestamptz,
  clinic text,
  area text,
  mobile text,
  rating numeric,
  reviews integer,
  why_included text,
  google_maps_url text,
  sent boolean,
  reply_1 text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 5000), 1), 5000);
  v_query text := nullif(trim(coalesce(p_query, '')), '');
begin
  if (select auth.uid()) is null then
    return;
  end if;
  if not public.has_tenant_access(p_tenant) then
    return;
  end if;
  if p_kind not in ('contacts', 'leads') then
    return;
  end if;

  return query
  select
    c.id,
    c.first_name,
    coalesce(c.last_name, ''),
    coalesce(c.email, ''),
    coalesce(c.phone, ''),
    coalesce(c.company, ''),
    c.status,
    c.lead_status,
    coalesce((select ls.name from public.lead_sources ls
              where ls.id = c.source_id and ls.tenant_id = c.tenant_id), ''),
    coalesce((select pr.full_name from public.profiles pr
              where pr.id = c.assigned_to), ''),
    coalesce((
      select string_agg(t.name, ', ' order by t.name)
      from public.contact_tags ct
      join public.tags t on t.id = ct.tag_id and t.tenant_id = ct.tenant_id
      where ct.tenant_id = c.tenant_id and ct.contact_id = c.id
    ), ''),
    coalesce(c.notes, ''),
    c.custom_data,
    c.created_at,
    c.clinic,
    c.area,
    c.mobile,
    c.rating,
    c.reviews,
    c.why_included,
    c.google_maps_url,
    c.sent,
    c.reply_1
  from public.contacts c
  where c.tenant_id = p_tenant
    and public.can_view_contact(p_tenant, c.id)
    and (p_kind <> 'leads' or c.status = 'lead')
    and (v_query is null
         or c.first_name ilike '%' || v_query || '%'
         or coalesce(c.last_name, '') ilike '%' || v_query || '%'
         or coalesce(c.email, '') ilike '%' || v_query || '%'
         or coalesce(c.phone, '') ilike '%' || v_query || '%'
         or coalesce(c.company, '') ilike '%' || v_query || '%')
    and (p_status is null or c.status = p_status)
    and (p_lead_status is null or c.lead_status = p_lead_status)
    and (p_source_id is null or c.source_id = p_source_id)
    and (p_assigned_to is null or c.assigned_to = p_assigned_to)
    and (p_tag_id is null or exists (
      select 1 from public.contact_tags ct
      where ct.tenant_id = c.tenant_id and ct.contact_id = c.id and ct.tag_id = p_tag_id
    ))
  order by c.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.crm_export_rows(uuid, text, text, text, text, uuid, uuid, uuid, integer) from public;
grant execute on function public.crm_export_rows(uuid, text, text, text, text, uuid, uuid, uuid, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. crm_process_import_batch: authoritative 0009 body plus lead fields
-- -----------------------------------------------------------------------------

create or replace function public.crm_process_import_batch(
  p_job_id uuid,
  p_batch_index integer,
  p_rows jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_job public.contact_import_jobs%rowtype;
  v_tenant uuid;
  v_mode text;
  v_kind text;
  v_existing jsonb;
  v_count integer;
  v_index integer;
  v_tag_index integer;
  v_row jsonb;
  v_row_number text;
  v_first text;
  v_last text;
  v_email text;
  v_phone text;
  v_company text;
  v_notes text;
  v_lead_status text;
  v_status text;
  v_source_id uuid;
  v_assigned uuid;
  v_source_name text;
  v_custom jsonb;
  v_tag_ids jsonb;
  v_tag_id uuid;
  v_dup_id uuid;
  v_match text;
  v_contact_id uuid;
  v_result text;
  v_message text;
  v_details text[];
  v_detail text;
  v_clinic text;
  v_area text;
  v_mobile text;
  v_rating numeric;
  v_reviews integer;
  v_why_included text;
  v_google_maps_url text;
  v_sent boolean;
  v_reply_1 text;
  v_rating_raw text;
  v_reviews_raw text;
  v_sent_raw text;
  v_results jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_created integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_job from public.contact_import_jobs j where j.id = p_job_id;
  if not found then
    raise exception 'Import job not found';
  end if;
  v_tenant := v_job.tenant_id;
  if not public.has_tenant_access(v_tenant) or not public.can_manage_crm(v_tenant) then
    raise exception 'No access to this import';
  end if;
  if v_job.status not in ('pending', 'processing') then
    raise exception 'This import is already closed';
  end if;
  if p_batch_index is null or p_batch_index < 0 then
    raise exception 'Invalid batch index';
  end if;

  -- Idempotency: a replayed batch never writes twice.
  select b.results into v_existing
  from public.contact_import_batches b
  where b.job_id = p_job_id and b.batch_index = p_batch_index;
  if found then
    return jsonb_build_object(
      'results', v_existing,
      'replayed', true,
      'created', v_job.created_count,
      'updated', v_job.updated_count,
      'skipped', v_job.skipped_count,
      'failed', v_job.failed_count
    );
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows must be an array';
  end if;
  v_count := jsonb_array_length(p_rows);
  if v_count < 1 or v_count > 100 then
    raise exception 'A batch must contain between 1 and 100 rows';
  end if;

  v_mode := v_job.duplicate_mode;
  v_kind := v_job.kind;

  for v_index in 0 .. v_count - 1 loop
    v_row := p_rows -> v_index;
    v_row_number := coalesce(v_row ->> 'rowNumber', (v_index + 1)::text);
    v_details := array[]::text[];
    v_result := 'failed';
    v_message := null;

    begin
      v_first := btrim(coalesce(v_row ->> 'first_name', ''));
      v_last := btrim(coalesce(v_row ->> 'last_name', ''));
      v_email := lower(btrim(coalesce(v_row ->> 'email', '')));
      v_phone := regexp_replace(coalesce(v_row ->> 'phone', ''), '\D', '', 'g');
      v_phone := ltrim(v_phone, '0');
      if length(v_phone) = 12 and left(v_phone, 2) = '91' then
        v_phone := substring(v_phone from 3);
      end if;
      v_company := btrim(coalesce(v_row ->> 'company', ''));
      v_notes := btrim(coalesce(v_row ->> 'notes', ''));
      v_lead_status := nullif(btrim(coalesce(v_row ->> 'lead_status', v_row ->> 'leadStatus', '')), '');
      v_status := nullif(btrim(coalesce(v_row ->> 'status', '')), '');
      v_lead_status := coalesce(v_lead_status, 'new');
      v_status := coalesce(v_status, case when v_kind = 'leads' then 'lead' else 'lead' end);
      v_custom := case when jsonb_typeof(v_row -> 'custom_data') = 'object'
                       then v_row -> 'custom_data' else '{}'::jsonb end;
      v_tag_ids := case when jsonb_typeof(v_row -> 'tag_ids') = 'array'
                        then v_row -> 'tag_ids' else '[]'::jsonb end;

      -- New lead columns. Friendly header spellings are accepted alongside
      -- the canonical snake_case keys.
      v_clinic := nullif(btrim(coalesce(v_row ->> 'clinic', '')), '');
      v_area := nullif(btrim(coalesce(v_row ->> 'area', '')), '');
      v_mobile := public.normalize_lead_mobile(coalesce(
        v_row ->> 'mobile', v_row ->> 'mobile (+91)', v_row ->> 'Mobile (+91)', ''
      ));
      v_why_included := nullif(btrim(coalesce(
        v_row ->> 'why_included', v_row ->> 'why included', ''
      )), '');
      v_google_maps_url := nullif(btrim(coalesce(
        v_row ->> 'google_maps_url', v_row ->> 'google maps url', v_row ->> 'google maps link', ''
      )), '');
      v_reply_1 := nullif(btrim(coalesce(
        v_row ->> 'reply_1', v_row ->> 'reply 1', v_row ->> 'reply1', ''
      )), '');

      v_rating := null;
      v_rating_raw := btrim(coalesce(v_row ->> 'rating', ''));
      if v_rating_raw <> '' then
        begin
          v_rating := v_rating_raw::numeric;
        exception when others then
          v_rating := null;
          v_details := v_details || 'Invalid rating (must be a number between 0 and 5)';
        end;
        if v_rating is not null and (v_rating < 0 or v_rating > 5) then
          v_details := v_details || 'Invalid rating (must be between 0 and 5)';
        end if;
      end if;

      v_reviews := null;
      v_reviews_raw := btrim(coalesce(v_row ->> 'reviews', ''));
      if v_reviews_raw <> '' then
        begin
          v_reviews := v_reviews_raw::integer;
        exception when others then
          v_reviews := null;
          v_details := v_details || 'Invalid reviews (must be a non-negative integer)';
        end;
        if v_reviews is not null and v_reviews < 0 then
          v_details := v_details || 'Invalid reviews (must be a non-negative integer)';
        end if;
      end if;

      v_sent := false;
      v_sent_raw := lower(btrim(coalesce(v_row ->> 'sent', '')));
      if v_sent_raw in ('y', 'yes', 'true', '1') then
        v_sent := true;
      elsif v_sent_raw in ('n', 'no', 'false', '0') then
        v_sent := false;
      elsif v_sent_raw <> '' then
        v_details := v_details || 'Invalid sent value (use Y/N, yes/no, true/false or 1/0)';
      end if;

      if v_first = '' then v_details := v_details || 'First name is required'; end if;
      if length(v_first) > 100 then v_details := v_details || 'First name is too long'; end if;
      if length(v_last) > 100 then v_details := v_details || 'Last name is too long'; end if;
      if v_email <> '' and (length(v_email) > 255 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
        v_details := v_details || 'Invalid email address';
      end if;
      if v_phone <> '' and (length(v_phone) < 7 or length(v_phone) > 15 or v_phone !~ '^[0-9]+$') then
        v_details := v_details || 'Invalid phone number';
      end if;
      if length(v_company) > 150 then v_details := v_details || 'Company name is too long'; end if;
      if length(v_notes) > 2000 then v_details := v_details || 'Notes are too long'; end if;
      if v_lead_status not in ('new', 'contacted', 'qualified', 'unqualified', 'converted') then
        v_details := v_details || 'Invalid lead status';
      end if;
      if v_status not in ('lead', 'customer', 'inactive') then
        v_details := v_details || 'Invalid contact status';
      end if;
      if v_kind = 'leads' and v_status <> 'lead' then
        v_details := v_details || 'A lead import cannot create a customer';
      end if;

      -- Configuration references must exist in THIS tenant.
      if v_row ? 'source_id' and nullif(btrim(coalesce(v_row ->> 'source_id', '')), '') is not null then
        begin
          v_source_id := (v_row ->> 'source_id')::uuid;
        exception when others then
          v_source_id := null;
          v_details := v_details || 'Invalid lead source';
        end;
        if v_source_id is not null then
          select ls.name into v_source_name
          from public.lead_sources ls
          where ls.id = v_source_id and ls.tenant_id = v_tenant and ls.active;
          if not found then
            v_details := v_details || 'Lead source is not active in this business';
          end if;
        end if;
      else
        v_source_id := null;
        v_source_name := null;
      end if;

      if nullif(btrim(coalesce(v_row ->> 'assigned_to', '')), '') is not null then
        begin
          v_assigned := (v_row ->> 'assigned_to')::uuid;
        exception when others then
          v_assigned := null;
          v_details := v_details || 'Invalid owner';
        end;
        if v_assigned is not null and not public.is_active_member(v_tenant, v_assigned) then
          v_details := v_details || 'Owner is not an active member of this business';
        end if;
      else
        v_assigned := null;
      end if;

      -- Custom field keys must be declared for this tenant and record type.
      if exists (select 1 from jsonb_object_keys(v_custom) as k(key)) then
        if exists (
          select 1
          from jsonb_object_keys(v_custom) as k(key)
          where not exists (
            select 1 from public.custom_fields cf
            where cf.tenant_id = v_tenant
              and cf.key = k.key
              and cf.active
              and cf.entity_type in ('contact', 'lead')
          )
        ) then
          v_details := v_details || 'Unknown custom field';
        end if;
      end if;

      -- Tags must belong to this tenant.
      for v_tag_index in 0 .. jsonb_array_length(v_tag_ids) - 1 loop
        v_tag_id := null;
        begin
          v_tag_id := (v_tag_ids ->> v_tag_index)::uuid;
        exception when others then
          v_details := v_details || 'Invalid tag';
        end;
        if v_tag_id is not null and not exists (
          select 1 from public.tags t where t.id = v_tag_id and t.tenant_id = v_tenant
        ) then
          v_details := v_details || 'Tag does not belong to this business';
        end if;
      end loop;

      if coalesce(array_length(v_details, 1), 0) > 0 then
        v_result := 'failed';
        v_message := array_to_string(v_details, '; ');
      else
        -- Authoritative duplicate check, scoped to the job's tenant.
        -- mobile deliberately does not participate in duplicate matching.
        v_dup_id := null;
        v_match := null;
        if v_email <> '' then
          select c.id into v_dup_id
          from public.contacts c
          where c.tenant_id = v_tenant
            and public.can_view_contact(v_tenant, c.id)
            and lower(c.email) = v_email
          order by c.created_at
          limit 1;
          if found then v_match := 'email'; end if;
        end if;
        if v_dup_id is null and v_phone <> '' and length(v_phone) >= 7 then
          select c.id into v_dup_id
          from public.contacts c
          where c.tenant_id = v_tenant
            and public.can_view_contact(v_tenant, c.id)
            and ltrim(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), '0') = v_phone
          order by c.created_at
          limit 1;
          if found then v_match := 'phone'; end if;
        end if;

        if v_dup_id is not null and v_mode = 'skip' then
          v_result := 'skipped';
          v_message := 'Possible duplicate (' || v_match || ')';
        elsif v_dup_id is not null and v_mode = 'new' and not v_job.confirmed_new_duplicates then
          v_result := 'skipped';
          v_message := 'Duplicate import was not confirmed';
        elsif v_dup_id is not null and v_mode = 'update' then
          update public.contacts c
          set first_name = v_first,
              last_name = nullif(v_last, ''),
              email = nullif(v_email, ''),
              phone = case when v_phone <> '' then v_phone else c.phone end,
              company = nullif(v_company, ''),
              notes = case when v_notes <> '' then v_notes else c.notes end,
              lead_status = v_lead_status,
              status = v_status,
              custom_data = v_custom,
              clinic = v_clinic,
              area = v_area,
              mobile = v_mobile,
              rating = v_rating,
              reviews = v_reviews,
              why_included = v_why_included,
              google_maps_url = v_google_maps_url,
              sent = v_sent,
              reply_1 = v_reply_1
          where c.tenant_id = v_tenant and c.id = v_dup_id;
          v_contact_id := v_dup_id;
          v_result := 'updated';
        else
          insert into public.contacts (
            tenant_id, first_name, last_name, email, phone, company, source,
            source_id, notes, status, lead_status, assigned_to, custom_data,
            import_allow_duplicate,
            clinic, area, mobile, rating, reviews, why_included,
            google_maps_url, sent, reply_1
          ) values (
            v_tenant, v_first, nullif(v_last, ''), nullif(v_email, ''),
            nullif(v_phone, ''), nullif(v_company, ''), v_source_name,
            v_source_id, nullif(v_notes, ''), v_status, v_lead_status,
            v_assigned, v_custom,
            (v_mode = 'new' and v_job.confirmed_new_duplicates),
            v_clinic, v_area, v_mobile, v_rating, v_reviews, v_why_included,
            v_google_maps_url, v_sent, v_reply_1
          ) returning id into v_contact_id;
          v_result := 'created';
        end if;

        if v_result in ('created', 'updated') then
          for v_tag_index in 0 .. jsonb_array_length(v_tag_ids) - 1 loop
            v_tag_id := (v_tag_ids ->> v_tag_index)::uuid;
            insert into public.contact_tags (tenant_id, contact_id, tag_id)
            values (v_tenant, v_contact_id, v_tag_id)
            on conflict (tenant_id, contact_id, tag_id) do nothing;
          end loop;
        end if;
      end if;
    exception when others then
      v_result := 'failed';
      -- Never expose raw database errors to the browser.
      v_message := 'Could not import this row (' || sqlstate || ')';
      if sqlerrm like '%duplicate key%' then
        v_result := 'skipped';
        v_message := 'Possible duplicate (unique constraint)';
      end if;
    end;

    if v_result = 'created' then v_created := v_created + 1; end if;
    if v_result = 'updated' then v_updated := v_updated + 1; end if;
    if v_result = 'skipped' then v_skipped := v_skipped + 1; end if;
    if v_result = 'failed' then v_failed := v_failed + 1; end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'rowNumber', v_row_number,
      'status', v_result,
      'message', v_message,
      'name', v_first || ' ' || v_last,
      'clinic', v_clinic,
      'area', v_area,
      'mobile', v_mobile,
      'rating', v_rating,
      'reviews', v_reviews,
      'why_included', v_why_included,
      'google_maps_url', v_google_maps_url,
      'sent', v_sent,
      'reply_1', v_reply_1
    ));
    if v_result in ('failed', 'skipped') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'rowNumber', v_row_number,
        'status', v_result,
        'message', coalesce(v_message, ''),
        'name', v_first || ' ' || v_last,
        'clinic', v_clinic,
        'area', v_area,
        'mobile', v_mobile,
        'rating', v_rating,
        'reviews', v_reviews,
        'why_included', v_why_included,
        'google_maps_url', v_google_maps_url,
        'sent', v_sent,
        'reply_1', v_reply_1
      ));
    end if;
  end loop;

  update public.contact_import_jobs j
  set status = 'processing',
      started_at = coalesce(j.started_at, now()),
      processed_rows = j.processed_rows + v_count,
      created_count = j.created_count + v_created,
      updated_count = j.updated_count + v_updated,
      skipped_count = j.skipped_count + v_skipped,
      failed_count = j.failed_count + v_failed,
      error_report = j.error_report || v_errors
  where j.id = p_job_id;

  insert into public.contact_import_batches (job_id, batch_index, row_count, results)
  values (p_job_id, p_batch_index, v_count, v_results);

  return jsonb_build_object(
    'results', v_results,
    'replayed', false,
    'created', v_created,
    'updated', v_updated,
    'skipped', v_skipped,
    'failed', v_failed
  );
end;
$$;

revoke all on function public.crm_process_import_batch(uuid, integer, jsonb) from public;
grant execute on function public.crm_process_import_batch(uuid, integer, jsonb) to authenticated;

commit;
