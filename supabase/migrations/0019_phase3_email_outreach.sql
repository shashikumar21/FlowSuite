-- AI Sales Agent Phase 3: secure drafting, campaigns, approvals and send
-- preparation. Extends 0017; never edits an earlier migration.
--
-- Contract:
-- * Existing tables (outreach_campaigns, outreach_messages, outreach_outbox,
--   suppression_list, decision_makers) are reused, not recreated.
-- * Browser code gets SELECT only on tenant-owned tables. Every write goes
--   through a SECURITY DEFINER RPC that checks has_tenant_access() first.
-- * Approval and destructive actions additionally require
--   public.can_manage_sales_agent(p_tenant). Client roles are UX only.
-- * Suppression is re-checked server-side at submit, approve and queue time.
-- * Queue idempotency uses the existing unique (tenant_id, idempotency_key).
-- * Provider is never set here: nothing in this migration sends an email.

-- ---------------------------------------------------------------------------
-- 1. Additive columns (0017 tables are left otherwise untouched)
-- ---------------------------------------------------------------------------

alter table public.outreach_campaigns
  add column if not exists product_offered text,
  add column if not exists problem_addressed text;

alter table public.outreach_messages
  add column if not exists decision_maker_id uuid,
  add column if not exists opening text,
  add column if not exists cta text,
  add column if not exists follow_up_subject text,
  add column if not exists follow_up_body text,
  add column if not exists generation_source text not null default 'manual'
    check (generation_source in ('manual', 'ai')),
  add column if not exists submitted_at timestamptz;

-- decision_makers already has unique (id, tenant_id); mirror the column order
-- used by the other composite FKs in 0017.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'outreach_messages_decision_maker_fkey'
  ) then
    alter table public.outreach_messages
      add constraint outreach_messages_decision_maker_fkey
      foreign key (decision_maker_id, tenant_id)
      references public.decision_makers(id, tenant_id)
      on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Approval decision history (new table, tenant scoped, read-only to client)
-- ---------------------------------------------------------------------------

create table if not exists public.sales_email_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  campaign_id uuid not null,
  message_id uuid not null,
  decision text not null check (decision in ('approved', 'rejected')),
  actor_id uuid,
  edited_subject text,
  edited_body text,
  reason text,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (campaign_id, tenant_id)
    references public.outreach_campaigns(id, tenant_id) on delete cascade,
  foreign key (message_id, tenant_id)
    references public.outreach_messages(id, tenant_id) on delete cascade,
  foreign key (tenant_id, actor_id)
    references public.business_members(tenant_id, user_id) on delete set null
);

alter table public.sales_email_approvals enable row level security;

drop policy if exists sales_email_approvals_select on public.sales_email_approvals;
create policy sales_email_approvals_select
  on public.sales_email_approvals for select to authenticated
  using (public.has_tenant_access(tenant_id));

-- Supabase default privileges can grant more than intended: be explicit.
revoke all on public.sales_email_approvals from public, anon, authenticated;
grant select on public.sales_email_approvals to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Campaign creation (creates real draft rows; no sending, no fake stats)
-- ---------------------------------------------------------------------------

create or replace function public.sales_create_campaign(
  p_tenant uuid,
  p_name text,
  p_objective text,
  p_tone text,
  p_product_offered text,
  p_problem_addressed text,
  p_prospect_ids jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_campaign uuid;
  v_element jsonb;
  v_prospect uuid;
  v_email text;
  v_seen uuid[] := '{}'::uuid[];
  v_created integer := 0;
  v_no_email integer := 0;
  v_suppressed integer := 0;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Invalid campaign name'; end if;
  if length(btrim(coalesce(p_objective, ''))) not between 1 and 500 then raise exception 'Invalid objective'; end if;
  if coalesce(p_tone, '') not in ('professional', 'friendly', 'concise', 'consultative') then
    raise exception 'Invalid tone';
  end if;
  if jsonb_typeof(p_prospect_ids) is distinct from 'array' or jsonb_array_length(p_prospect_ids) = 0 then
    raise exception 'Select at least one prospect';
  end if;

  insert into public.outreach_campaigns (
    tenant_id, name, status, tone, objective, product_offered, problem_addressed, created_by
  ) values (
    p_tenant, btrim(p_name), 'draft', p_tone, btrim(p_objective),
    nullif(btrim(coalesce(p_product_offered, '')), ''),
    nullif(btrim(coalesce(p_problem_addressed, '')), ''),
    v_caller
  ) returning id into v_campaign;

  for v_element in select value from jsonb_array_elements(p_prospect_ids) loop
    v_prospect := nullif(btrim(coalesce(v_element #>> '{}', '')), '')::uuid;
    if v_prospect = any(v_seen) then continue; end if;
    v_seen := v_seen || v_prospect;

    select lower(btrim(p.email)) into v_email
    from public.prospects p
    where p.id = v_prospect and p.tenant_id = p_tenant;
    if not found then raise exception 'Prospect not found in this business'; end if;

    if coalesce(v_email, '') = '' then
      v_no_email := v_no_email + 1;
      continue;
    end if;
    if public.sales_is_suppressed(p_tenant, v_email) then
      v_suppressed := v_suppressed + 1;
      continue;
    end if;

    -- Honest placeholder content: no message is invented by the database.
    insert into public.outreach_messages (
      tenant_id, campaign_id, prospect_id, recipient_email, subject, body,
      status, generation_source
    ) values (
      p_tenant, v_campaign, v_prospect, v_email,
      'Draft pending generation',
      'This draft has not been written yet. Open the AI Email Writer to create it.',
      'draft', 'manual'
    );
    v_created := v_created + 1;
  end loop;

  if v_created = 0 then
    raise exception 'No eligible recipients: add an email or clear suppression';
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_caller, 'sales.campaign_created', 'outreach_campaign', v_campaign::text,
    jsonb_build_object(
      'recipients_created', v_created,
      'skipped_no_email', v_no_email,
      'skipped_suppressed', v_suppressed
    )
  );

  return jsonb_build_object(
    'campaign_id', v_campaign,
    'recipients_created', v_created,
    'skipped_no_email', v_no_email,
    'skipped_suppressed', v_suppressed
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Draft saving and submission for approval
-- ---------------------------------------------------------------------------

create or replace function public.sales_save_email_draft(
  p_tenant uuid,
  p_message uuid,
  p_decision_maker uuid,
  p_subject text,
  p_body text,
  p_opening text,
  p_cta text,
  p_follow_up_subject text,
  p_follow_up_body text,
  p_generation_source text default 'manual'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_message public.outreach_messages%rowtype;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if length(btrim(coalesce(p_subject, ''))) not between 1 and 200 then raise exception 'Invalid subject'; end if;
  if length(btrim(coalesce(p_body, ''))) not between 1 and 10000 then raise exception 'Invalid body'; end if;
  if coalesce(p_generation_source, '') not in ('manual', 'ai') then raise exception 'Invalid generation source'; end if;

  select * into v_message
  from public.outreach_messages
  where id = p_message and tenant_id = p_tenant
  for update;
  if not found then raise exception 'Message not found'; end if;
  if v_message.status not in ('draft', 'pending_approval') then
    raise exception 'Message can no longer be edited';
  end if;

  if p_decision_maker is not null and not exists (
    select 1 from public.decision_makers dm
    where dm.id = p_decision_maker
      and dm.tenant_id = p_tenant
      and dm.prospect_id = v_message.prospect_id
  ) then
    raise exception 'Decision maker does not belong to this prospect';
  end if;

  update public.outreach_messages
  set decision_maker_id = p_decision_maker,
      subject = btrim(p_subject),
      body = btrim(p_body),
      opening = nullif(btrim(coalesce(p_opening, '')), ''),
      cta = nullif(btrim(coalesce(p_cta, '')), ''),
      follow_up_subject = nullif(btrim(coalesce(p_follow_up_subject, '')), ''),
      follow_up_body = nullif(btrim(coalesce(p_follow_up_body, '')), ''),
      generation_source = p_generation_source,
      updated_at = now()
  where id = p_message and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_caller, 'sales.email_draft_saved', 'outreach_message', p_message::text,
    jsonb_build_object('generation_source', p_generation_source)
  );
end;
$$;

create or replace function public.sales_submit_for_approval(
  p_tenant uuid,
  p_message uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_message public.outreach_messages%rowtype;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;

  select * into v_message
  from public.outreach_messages
  where id = p_message and tenant_id = p_tenant
  for update;
  if not found then raise exception 'Message not found'; end if;
  if v_message.status <> 'draft' then raise exception 'Message is not a draft'; end if;
  if coalesce(btrim(v_message.recipient_email), '') = '' then
    raise exception 'Recipient email is required';
  end if;
  if v_message.body = 'This draft has not been written yet. Open the AI Email Writer to create it.' then
    raise exception 'Write the message before submitting it for approval';
  end if;
  if public.sales_is_suppressed(p_tenant, v_message.recipient_email) then
    raise exception 'Recipient is suppressed';
  end if;

  update public.outreach_messages
  set status = 'pending_approval', submitted_at = now(), updated_at = now()
  where id = p_message and tenant_id = p_tenant;

  update public.outreach_campaigns
  set status = 'pending_approval', updated_at = now()
  where id = v_message.campaign_id and tenant_id = p_tenant and status = 'draft';

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'sales.email_submitted_for_approval', 'outreach_message', p_message::text, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Approval decision (server-authoritative, owner/admin only)
-- ---------------------------------------------------------------------------

create or replace function public.sales_review_email_draft(
  p_tenant uuid,
  p_message uuid,
  p_decision text,
  p_edited_subject text,
  p_edited_body text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_message public.outreach_messages%rowtype;
  v_subject text;
  v_body text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if not public.can_manage_sales_agent(p_tenant) then raise exception 'Only an owner or admin can review outreach'; end if;
  if coalesce(p_decision, '') not in ('approve', 'reject') then raise exception 'Invalid decision'; end if;

  select * into v_message
  from public.outreach_messages
  where id = p_message and tenant_id = p_tenant
  for update;
  if not found then raise exception 'Message not found'; end if;
  if v_message.status <> 'pending_approval' then raise exception 'Message is not awaiting approval'; end if;

  v_subject := v_message.subject;
  v_body := v_message.body;
  if p_edited_subject is not null then
    if length(btrim(p_edited_subject)) not between 1 and 200 then raise exception 'Invalid edited subject'; end if;
    v_subject := btrim(p_edited_subject);
  end if;
  if p_edited_body is not null then
    if length(btrim(p_edited_body)) not between 1 and 10000 then raise exception 'Invalid edited body'; end if;
    v_body := btrim(p_edited_body);
  end if;

  if p_decision = 'approve' then
    if public.sales_is_suppressed(p_tenant, v_message.recipient_email) then
      raise exception 'Recipient is suppressed; approval refused';
    end if;
    update public.outreach_messages
    set status = 'approved',
        subject = v_subject,
        body = v_body,
        approved_by = v_caller,
        approved_at = now(),
        rejected_reason = null,
        updated_at = now()
    where id = p_message and tenant_id = p_tenant;

    if not exists (
      select 1 from public.outreach_messages m
      where m.campaign_id = v_message.campaign_id and m.tenant_id = p_tenant
        and m.status in ('draft', 'pending_approval', 'rejected')
    ) then
      update public.outreach_campaigns
      set status = 'approved', updated_at = now()
      where id = v_message.campaign_id and tenant_id = p_tenant;
    end if;
  else
    if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'A rejection reason is required'; end if;
    update public.outreach_messages
    set status = 'rejected', rejected_reason = btrim(p_reason), updated_at = now()
    where id = p_message and tenant_id = p_tenant;

    update public.outreach_campaigns
    set status = 'rejected', rejected_reason = btrim(p_reason), updated_at = now()
    where id = v_message.campaign_id and tenant_id = p_tenant;
  end if;

  insert into public.sales_email_approvals (
    tenant_id, campaign_id, message_id, decision, actor_id, edited_subject, edited_body, reason
  ) values (
    p_tenant, v_message.campaign_id, p_message, p_decision, v_caller,
    nullif(btrim(coalesce(p_edited_subject, '')), ''),
    nullif(btrim(coalesce(p_edited_body, '')), ''),
    nullif(btrim(coalesce(p_reason, '')), '')
  );

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_caller,
    case when p_decision = 'approve' then 'sales.email_approved' else 'sales.email_rejected' end,
    'outreach_message', p_message::text,
    jsonb_build_object('decision', p_decision, 'edited', p_edited_subject is not null or p_edited_body is not null)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Send queue preparation — no provider is configured, nothing is sent
-- ---------------------------------------------------------------------------

create or replace function public.sales_queue_approved_email(
  p_tenant uuid,
  p_message uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_message public.outreach_messages%rowtype;
  v_key text;
  v_existing uuid;
  v_outbox uuid;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if not public.can_manage_sales_agent(p_tenant) then raise exception 'Only an owner or admin can queue outreach'; end if;

  select * into v_message
  from public.outreach_messages
  where id = p_message and tenant_id = p_tenant
  for update;
  if not found then raise exception 'Message not found'; end if;
  if v_message.status <> 'approved' then raise exception 'Message is not approved'; end if;
  if public.sales_is_suppressed(p_tenant, v_message.recipient_email) then
    raise exception 'Recipient is suppressed; queue refused';
  end if;

  v_key := p_tenant::text || ':' || p_message::text;
  select id into v_existing
  from public.outreach_outbox
  where tenant_id = p_tenant and idempotency_key = v_key;
  if found then return v_existing; end if;

  -- provider stays NULL on purpose: no sending integration is configured.
  insert into public.outreach_outbox (
    tenant_id, message_id, prospect_id, recipient_email, status, idempotency_key, attempts
  ) values (
    p_tenant, p_message, v_message.prospect_id, v_message.recipient_email, 'queued', v_key, 0
  ) returning id into v_outbox;

  update public.outreach_messages
  set status = 'queued', updated_at = now()
  where id = p_message and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_caller, 'sales.email_queued', 'outreach_outbox', v_outbox::text,
    jsonb_build_object('message_id', p_message, 'provider', null)
  );

  return v_outbox;
end;
$$;

create or replace function public.sales_add_suppression(
  p_tenant uuid,
  p_email text,
  p_reason text,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_email text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if not public.can_manage_sales_agent(p_tenant) then raise exception 'Only an owner or admin can manage suppression'; end if;
  v_email := lower(btrim(coalesce(p_email, '')));
  if v_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' or length(v_email) > 255 then
    raise exception 'Invalid email address';
  end if;
  if coalesce(p_reason, '') not in ('unsubscribe', 'bounced', 'complaint', 'manual') then
    raise exception 'Invalid suppression reason';
  end if;

  insert into public.suppression_list (tenant_id, email, reason, source, created_by)
  values (p_tenant, v_email, p_reason, nullif(btrim(coalesce(p_source, '')), ''), v_caller)
  on conflict (tenant_id, lower(email))
  do update set reason = excluded.reason, source = excluded.source, created_by = excluded.created_by, created_at = now();

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'sales.suppression_added', 'suppression_list', v_email, jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.sales_mark_outbox_failed(
  p_tenant uuid,
  p_outbox uuid,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_row public.outreach_outbox%rowtype;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if not public.can_manage_sales_agent(p_tenant) then raise exception 'Only an owner or admin can manage the queue'; end if;
  if length(btrim(coalesce(p_error, ''))) = 0 then raise exception 'A failure reason is required'; end if;

  select * into v_row from public.outreach_outbox
  where id = p_outbox and tenant_id = p_tenant for update;
  if not found then raise exception 'Queue item not found'; end if;
  if v_row.status not in ('queued', 'processing') then raise exception 'Queue item is not active'; end if;
  if v_row.attempts >= 5 then raise exception 'Retry limit reached'; end if;

  update public.outreach_outbox
  set status = 'failed', last_error = btrim(p_error), attempts = attempts + 1, updated_at = now()
  where id = p_outbox and tenant_id = p_tenant;

  update public.outreach_messages
  set status = 'failed', updated_at = now()
  where id = v_row.message_id and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'sales.outbox_failed', 'outreach_outbox', p_outbox::text, jsonb_build_object('error', left(btrim(p_error), 300)));
end;
$$;

create or replace function public.sales_retry_outbox(
  p_tenant uuid,
  p_outbox uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_row public.outreach_outbox%rowtype;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if not public.can_manage_sales_agent(p_tenant) then raise exception 'Only an owner or admin can manage the queue'; end if;

  select * into v_row from public.outreach_outbox
  where id = p_outbox and tenant_id = p_tenant for update;
  if not found then raise exception 'Queue item not found'; end if;
  if v_row.status <> 'failed' then raise exception 'Only failed items can be retried'; end if;
  if v_row.attempts >= 3 then raise exception 'Retry limit reached'; end if;
  if public.sales_is_suppressed(p_tenant, v_row.recipient_email) then
    raise exception 'Recipient is suppressed; retry refused';
  end if;

  update public.outreach_outbox
  set status = 'queued', last_error = null, updated_at = now()
  where id = p_outbox and tenant_id = p_tenant;

  update public.outreach_messages
  set status = 'queued', updated_at = now()
  where id = v_row.message_id and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'sales.outbox_retried', 'outreach_outbox', p_outbox::text, '{}'::jsonb);
end;
$$;

-- Real counts from real rows only. No projections, scores or delivery claims.
create or replace function public.sales_campaign_summary(
  p_tenant uuid,
  p_campaign uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if not exists (select 1 from public.outreach_campaigns c where c.id = p_campaign and c.tenant_id = p_tenant) then
    raise exception 'Campaign not found';
  end if;

  select jsonb_build_object(
    'recipients', count(*),
    'drafts', count(*) filter (where status = 'draft'),
    'pending_approval', count(*) filter (where status = 'pending_approval'),
    'approved', count(*) filter (where status = 'approved'),
    'rejected', count(*) filter (where status = 'rejected'),
    'queued', count(*) filter (where status = 'queued'),
    'sent', count(*) filter (where status = 'sent'),
    'failed', count(*) filter (where status = 'failed')
  ) into v_result
  from public.outreach_messages
  where tenant_id = p_tenant and campaign_id = p_campaign;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants — Supabase grants anon by default on new functions
-- ---------------------------------------------------------------------------

revoke all on function public.sales_create_campaign(uuid, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.sales_create_campaign(uuid, text, text, text, text, text, jsonb) to authenticated;

revoke all on function public.sales_save_email_draft(uuid, uuid, uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.sales_save_email_draft(uuid, uuid, uuid, text, text, text, text, text, text, text) to authenticated;

revoke all on function public.sales_submit_for_approval(uuid, uuid) from public, anon;
grant execute on function public.sales_submit_for_approval(uuid, uuid) to authenticated;

revoke all on function public.sales_review_email_draft(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.sales_review_email_draft(uuid, uuid, text, text, text, text) to authenticated;

revoke all on function public.sales_queue_approved_email(uuid, uuid) from public, anon;
grant execute on function public.sales_queue_approved_email(uuid, uuid) to authenticated;

revoke all on function public.sales_add_suppression(uuid, text, text, text) from public, anon;
grant execute on function public.sales_add_suppression(uuid, text, text, text) to authenticated;

revoke all on function public.sales_mark_outbox_failed(uuid, uuid, text) from public, anon;
grant execute on function public.sales_mark_outbox_failed(uuid, uuid, text) to authenticated;

revoke all on function public.sales_retry_outbox(uuid, uuid) from public, anon;
grant execute on function public.sales_retry_outbox(uuid, uuid) to authenticated;

revoke all on function public.sales_campaign_summary(uuid, uuid) from public, anon;
grant execute on function public.sales_campaign_summary(uuid, uuid) to authenticated;
