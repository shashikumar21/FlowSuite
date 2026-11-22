-- AI Sales Agent Phase 4: decision makers, verification evidence, research
-- signals and manual reply handling. Extends 0017/0019; never edits an earlier
-- migration. LOCAL ONLY — not applied to the hosted project.
--
-- Contract:
-- * All four tables already exist in 0017 with RLS SELECT for tenant members.
-- * Browser code has no INSERT/UPDATE/DELETE on them; every write goes through
--   a SECURITY DEFINER RPC that checks has_tenant_access() first.
-- * Only manual verification is accepted. A verified result must name the
--   human who attested (auth.uid()); no client can fabricate a provider result.
-- * Destructive actions require public.can_manage_sales_agent(p_tenant).
-- * Unsubscribe replies add the sender to suppression_list server-side.
-- * No provider is called and no email is sent by this migration.

-- ---------------------------------------------------------------------------
-- 1. Decision makers
-- ---------------------------------------------------------------------------

create or replace function public.sales_create_decision_maker(
  p_tenant uuid,
  p_prospect uuid,
  p_full_name text,
  p_job_title text,
  p_email text,
  p_phone text,
  p_linkedin_url text,
  p_research_source text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_id uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if length(btrim(coalesce(p_full_name, ''))) not between 1 and 150 then
    raise exception 'Invalid full name';
  end if;
  if v_email is not null and (
    length(v_email) > 255 or v_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  ) then
    raise exception 'Invalid email address';
  end if;
  if not exists (select 1 from public.prospects p where p.id = p_prospect and p.tenant_id = p_tenant) then
    raise exception 'Prospect not found in this business';
  end if;

  insert into public.decision_makers (
    tenant_id, prospect_id, full_name, job_title, email, phone,
    linkedin_url, research_source, verification_status, created_by
  ) values (
    p_tenant, p_prospect, btrim(p_full_name),
    nullif(btrim(coalesce(p_job_title, '')), ''),
    v_email,
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_linkedin_url, '')), ''),
    nullif(btrim(coalesce(p_research_source, '')), ''),
    'unverified', v_caller
  ) returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_caller, 'sales.decision_maker_created', 'decision_maker', v_id::text,
    jsonb_build_object('prospect_id', p_prospect)
  );
  return v_id;
end;
$$;

create or replace function public.sales_update_decision_maker(
  p_tenant uuid,
  p_decision_maker uuid,
  p_full_name text,
  p_job_title text,
  p_email text,
  p_phone text,
  p_linkedin_url text,
  p_research_source text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_prospect uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if length(btrim(coalesce(p_full_name, ''))) not between 1 and 150 then
    raise exception 'Invalid full name';
  end if;
  if v_email is not null and (
    length(v_email) > 255 or v_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  ) then
    raise exception 'Invalid email address';
  end if;

  select dm.prospect_id into v_prospect
  from public.decision_makers dm
  where dm.id = p_decision_maker and dm.tenant_id = p_tenant
  for update;
  if not found then raise exception 'Decision maker not found'; end if;

  update public.decision_makers
  set full_name = btrim(p_full_name),
      job_title = nullif(btrim(coalesce(p_job_title, '')), ''),
      email = v_email,
      phone = nullif(btrim(coalesce(p_phone, '')), ''),
      linkedin_url = nullif(btrim(coalesce(p_linkedin_url, '')), ''),
      research_source = nullif(btrim(coalesce(p_research_source, '')), ''),
      updated_at = now()
  where id = p_decision_maker and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_caller, 'sales.decision_maker_updated', 'decision_maker', p_decision_maker::text,
    jsonb_build_object('prospect_id', v_prospect)
  );
end;
$$;

create or replace function public.sales_delete_decision_maker(
  p_tenant uuid,
  p_decision_maker uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_prospect uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if not public.can_manage_sales_agent(p_tenant) then
    raise exception 'Only an owner or admin can delete a decision maker';
  end if;

  select dm.prospect_id into v_prospect
  from public.decision_makers dm
  where dm.id = p_decision_maker and dm.tenant_id = p_tenant
  for update;
  if not found then raise exception 'Decision maker not found'; end if;

  delete from public.decision_makers
  where id = p_decision_maker and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_caller, 'sales.decision_maker_deleted', 'decision_maker', p_decision_maker::text,
    jsonb_build_object('prospect_id', v_prospect)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Manual verification evidence (append-only)
-- ---------------------------------------------------------------------------

create or replace function public.sales_record_verification(
  p_tenant uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_status text,
  p_method text,
  p_evidence jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_exists boolean;
  v_id uuid;
  v_evidence jsonb := coalesce(p_evidence, '{}'::jsonb);
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if coalesce(p_status, '') not in ('unverified', 'pending', 'verified', 'invalid', 'unknown') then
    raise exception 'Invalid verification status';
  end if;
  -- No verification provider is configured. Until one exists server-side,
  -- only explicit human attestation is accepted.
  if coalesce(p_method, '') <> 'manual' then
    raise exception 'Only manual verification is available';
  end if;
  if jsonb_typeof(v_evidence) is distinct from 'object' then
    raise exception 'Evidence must be an object';
  end if;
  if length(v_evidence::text) > 4000 then raise exception 'Evidence is too large'; end if;

  if p_entity_type = 'prospect' then
    select exists (
      select 1 from public.prospects p where p.id = p_entity_id and p.tenant_id = p_tenant
    ) into v_exists;
  elsif p_entity_type = 'decision_maker' then
    select exists (
      select 1 from public.decision_makers dm where dm.id = p_entity_id and dm.tenant_id = p_tenant
    ) into v_exists;
  else
    raise exception 'Invalid entity type';
  end if;
  if not v_exists then raise exception 'Entity not found in this business'; end if;

  insert into public.contact_verifications (
    tenant_id, entity_type, entity_id, method, status, provider, checked_by, evidence
  ) values (
    p_tenant, p_entity_type, p_entity_id, 'manual', p_status, null, v_caller, v_evidence
  ) returning id into v_id;

  if p_entity_type = 'prospect' then
    update public.prospects
    set verification_status = p_status, updated_at = now()
    where id = p_entity_id and tenant_id = p_tenant;
  else
    update public.decision_makers
    set verification_status = p_status, updated_at = now()
    where id = p_entity_id and tenant_id = p_tenant;
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_caller, 'sales.verification_recorded', p_entity_type, p_entity_id::text,
    jsonb_build_object('status', p_status, 'method', 'manual', 'verification_id', v_id)
  );
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Research signals
-- ---------------------------------------------------------------------------

create or replace function public.sales_add_signal(
  p_tenant uuid,
  p_prospect uuid,
  p_signal_type text,
  p_summary text,
  p_source_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_id uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if coalesce(p_signal_type, '') not in ('note', 'website', 'news', 'referral', 'other') then
    raise exception 'Invalid signal type';
  end if;
  if length(btrim(coalesce(p_summary, ''))) not between 1 and 2000 then
    raise exception 'Invalid signal summary';
  end if;
  if not exists (select 1 from public.prospects p where p.id = p_prospect and p.tenant_id = p_tenant) then
    raise exception 'Prospect not found in this business';
  end if;

  insert into public.prospect_signals (
    tenant_id, prospect_id, signal_type, summary, source_url, recorded_by
  ) values (
    p_tenant, p_prospect, p_signal_type, btrim(p_summary),
    nullif(btrim(coalesce(p_source_url, '')), ''), v_caller
  ) returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_caller, 'sales.signal_added', 'prospect', p_prospect::text,
    jsonb_build_object('signal_type', p_signal_type, 'signal_id', v_id)
  );
  return v_id;
end;
$$;

create or replace function public.sales_delete_signal(
  p_tenant uuid,
  p_signal uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_prospect uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if not public.can_manage_sales_agent(p_tenant) then
    raise exception 'Only an owner or admin can delete a signal';
  end if;

  select s.prospect_id into v_prospect
  from public.prospect_signals s
  where s.id = p_signal and s.tenant_id = p_tenant
  for update;
  if not found then raise exception 'Signal not found'; end if;

  delete from public.prospect_signals
  where id = p_signal and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_caller, 'sales.signal_deleted', 'prospect', v_prospect::text,
    jsonb_build_object('signal_id', p_signal)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Manual reply ingestion and triage
-- ---------------------------------------------------------------------------

create or replace function public.sales_record_reply(
  p_tenant uuid,
  p_prospect uuid,
  p_message uuid,
  p_campaign uuid,
  p_sender_email text,
  p_subject text,
  p_body text,
  p_classification text,
  p_external_id text default null,
  p_received_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_sender text := nullif(lower(btrim(coalesce(p_sender_email, ''))), '');
  v_external text := nullif(btrim(coalesce(p_external_id, '')), '');
  v_campaign uuid;
  v_id uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if coalesce(p_classification, '') not in (
    'interested', 'not_interested', 'follow_up_required', 'unsubscribe', 'unknown'
  ) then
    raise exception 'Invalid classification';
  end if;
  if not exists (select 1 from public.prospects p where p.id = p_prospect and p.tenant_id = p_tenant) then
    raise exception 'Prospect not found in this business';
  end if;
  if p_message is not null and not exists (
    select 1 from public.outreach_messages m where m.id = p_message and m.tenant_id = p_tenant
  ) then
    raise exception 'Message not found in this business';
  end if;
  if p_campaign is not null and not exists (
    select 1 from public.outreach_campaigns c where c.id = p_campaign and c.tenant_id = p_tenant
  ) then
    raise exception 'Campaign not found in this business';
  end if;
  if v_sender is not null and (
    length(v_sender) > 255 or v_sender !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  ) then
    raise exception 'Invalid sender email';
  end if;

  -- A caller-supplied external id makes manual entry idempotent. Without one,
  -- generate a unique id so the tenant/provider/external unique index holds.
  if v_external is null then
    v_external := 'manual:' || gen_random_uuid()::text;
  end if;

  -- 'manual' is the only provider available; no webhook or polling exists.
  insert into public.outreach_replies (
    tenant_id, message_id, campaign_id, prospect_id, sender_email, subject, body,
    reply_status, classification, provider, external_id, received_at
  ) values (
    p_tenant, p_message, p_campaign, p_prospect, v_sender,
    nullif(btrim(coalesce(p_subject, '')), ''),
    nullif(btrim(coalesce(p_body, '')), ''),
    'unread', p_classification, 'manual', v_external,
    coalesce(p_received_at, now())
  ) returning id into v_id;

  -- Consent is authoritative: an unsubscribe reply suppresses the sender even
  -- if the client later forgets to show the classification.
  if p_classification = 'unsubscribe' and v_sender is not null then
    insert into public.suppression_list (tenant_id, email, reason, source, created_by)
    values (p_tenant, v_sender, 'unsubscribe', 'reply:' || v_id::text, v_caller)
    on conflict (tenant_id, lower(email))
    do update set reason = excluded.reason, source = excluded.source, created_by = excluded.created_by, created_at = now();
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_caller, 'sales.reply_recorded', 'outreach_reply', v_id::text,
    jsonb_build_object('prospect_id', p_prospect, 'classification', p_classification)
  );
  return v_id;
end;
$$;

create or replace function public.sales_update_reply(
  p_tenant uuid,
  p_reply uuid,
  p_reply_status text,
  p_classification text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_row public.outreach_replies%rowtype;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if coalesce(p_reply_status, '') not in ('unread', 'read', 'archived') then
    raise exception 'Invalid reply status';
  end if;
  if coalesce(p_classification, '') not in (
    'interested', 'not_interested', 'follow_up_required', 'unsubscribe', 'unknown'
  ) then
    raise exception 'Invalid classification';
  end if;

  select * into v_row
  from public.outreach_replies r
  where r.id = p_reply and r.tenant_id = p_tenant
  for update;
  if not found then raise exception 'Reply not found'; end if;

  -- outreach_replies has no updated_at column in 0017; only status changes.
  update public.outreach_replies
  set reply_status = p_reply_status,
      classification = p_classification
  where id = p_reply and tenant_id = p_tenant;

  if p_classification = 'unsubscribe' and coalesce(v_row.sender_email, '') <> '' then
    insert into public.suppression_list (tenant_id, email, reason, source, created_by)
    values (p_tenant, lower(btrim(v_row.sender_email)), 'unsubscribe', 'reply:' || p_reply::text, v_caller)
    on conflict (tenant_id, lower(email))
    do update set reason = excluded.reason, source = excluded.source, created_by = excluded.created_by, created_at = now();
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_caller, 'sales.reply_updated', 'outreach_reply', p_reply::text,
    jsonb_build_object('reply_status', p_reply_status, 'classification', p_classification)
  );
end;
$$;

create or replace function public.sales_delete_reply(
  p_tenant uuid,
  p_reply uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if not public.can_manage_sales_agent(p_tenant) then
    raise exception 'Only an owner or admin can delete a reply';
  end if;

  if not exists (select 1 from public.outreach_replies r where r.id = p_reply and r.tenant_id = p_tenant) then
    raise exception 'Reply not found';
  end if;

  delete from public.outreach_replies
  where id = p_reply and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'sales.reply_deleted', 'outreach_reply', p_reply::text, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants — Supabase grants anon EXECUTE by default on new functions
-- ---------------------------------------------------------------------------

revoke all on function public.sales_create_decision_maker(uuid, uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.sales_create_decision_maker(uuid, uuid, text, text, text, text, text, text) to authenticated;

revoke all on function public.sales_update_decision_maker(uuid, uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.sales_update_decision_maker(uuid, uuid, text, text, text, text, text, text) to authenticated;

revoke all on function public.sales_delete_decision_maker(uuid, uuid) from public, anon;
grant execute on function public.sales_delete_decision_maker(uuid, uuid) to authenticated;

revoke all on function public.sales_record_verification(uuid, text, uuid, text, text, jsonb) from public, anon;
grant execute on function public.sales_record_verification(uuid, text, uuid, text, text, jsonb) to authenticated;

revoke all on function public.sales_add_signal(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.sales_add_signal(uuid, uuid, text, text, text) to authenticated;

revoke all on function public.sales_delete_signal(uuid, uuid) from public, anon;
grant execute on function public.sales_delete_signal(uuid, uuid) to authenticated;

revoke all on function public.sales_record_reply(uuid, uuid, uuid, uuid, text, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.sales_record_reply(uuid, uuid, uuid, uuid, text, text, text, text, text, timestamptz) to authenticated;

revoke all on function public.sales_update_reply(uuid, uuid, text, text) from public, anon;
grant execute on function public.sales_update_reply(uuid, uuid, text, text) to authenticated;

revoke all on function public.sales_delete_reply(uuid, uuid) from public, anon;
grant execute on function public.sales_delete_reply(uuid, uuid) to authenticated;
