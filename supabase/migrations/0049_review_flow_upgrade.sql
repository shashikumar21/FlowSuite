-- Review Flow Upgrade: per-tenant Google review link + owner-side AI reply draft.
-- FORWARD-ONLY. Local file; not applied to hosted without explicit approval.
-- No external sends, no Google API calls, no patient data.

begin;

-- ---------------------------------------------------------------------------
-- 1. Additive schema changes
-- ---------------------------------------------------------------------------
alter table public.businesses
  add column if not exists google_review_url text;

alter table public.review_requests
  add column if not exists owner_reply_draft text,
  add column if not exists owner_reply_status text not null default 'not_requested'
    check (owner_reply_status in ('not_requested','generated','fallback','approved','rejected','copied')),
  add column if not exists owner_reply_approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists owner_reply_approved_at timestamptz,
  add column if not exists owner_reply_copied_at timestamptz;

create index if not exists review_requests_owner_reply_idx
  on public.review_requests (tenant_id, owner_reply_status);

-- Defensive constraint: even a direct table update cannot inject an arbitrary
-- URL. Only Google-hosted HTTPS links are accepted.
alter table public.businesses drop constraint if exists businesses_google_review_url_check;
alter table public.businesses add constraint businesses_google_review_url_check
  check (
    google_review_url is null
    or (
      length(btrim(google_review_url)) between 1 and 500
      and position('#' in google_review_url) = 0
      and position('@' in split_part(btrim(google_review_url), '/', 3)) = 0
      and (
        btrim(google_review_url) ~ '^https://(www\.|maps\.|search\.)?google\.com(/|\?|$)'
        or btrim(google_review_url) ~ '^https://g\.page(/|\?|$)'
        or btrim(google_review_url) ~ '^https://maps\.app\.goo\.gl(/|\?|$)'
      )
    )
  );

-- Shared server-side validation for reviewer-facing links. Arbitrary URLs are
-- not accepted: only Google-hosted HTTPS links can be used for this flow.
create or replace function public.is_google_review_url(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_url is not null
    and length(btrim(p_url)) between 1 and 500
    and position('#' in p_url) = 0
    and position('@' in split_part(btrim(p_url), '/', 3)) = 0
    and (
      btrim(p_url) ~ '^https://(www\.|maps\.|search\.)?google\.com(/|\?|$)'
      or btrim(p_url) ~ '^https://g\.page(/|\?|$)'
      or btrim(p_url) ~ '^https://maps\.app\.goo\.gl(/|\?|$)'
    );
$$;

revoke all on function public.is_google_review_url(text) from public, anon;
grant execute on function public.is_google_review_url(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Per-tenant Google review URL settings
-- ---------------------------------------------------------------------------
create or replace function public.business_update_review_settings(
  p_tenant uuid,
  p_google_review_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_url text := nullif(btrim(coalesce(p_google_review_url, '')), '');
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Access denied';
  end if;
  if not public.has_tenant_role(p_tenant, array['owner', 'admin']) then
    raise exception 'Owner or admin role required';
  end if;
  if v_url is not null and not public.is_google_review_url(v_url) then
    raise exception 'Invalid Google review URL';
  end if;

  update public.businesses
     set google_review_url = v_url, updated_at = now()
   where id = p_tenant;
  if not found then raise exception 'Business not found'; end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_actor, 'business.review_settings_updated', 'business', p_tenant::text,
    jsonb_build_object('has_google_review_url', v_url is not null)
  );
end;
$$;

revoke all on function public.business_update_review_settings(uuid, text) from public, anon;
grant execute on function public.business_update_review_settings(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Owner-side AI reply context, draft write and human status
-- ---------------------------------------------------------------------------
create or replace function public.review_reply_context(
  p_tenant uuid,
  p_request uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_business text;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Access denied';
  end if;
  if not public.has_tenant_role(p_tenant, array['owner', 'admin', 'manager']) then
    raise exception 'Manager role required to draft review replies';
  end if;

  select r.rating, r.customer_feedback, r.owner_reply_draft, r.owner_reply_status
    into v_row
    from public.review_requests r
   where r.id = p_request and r.tenant_id = p_tenant;
  if not found then raise exception 'Review request not found'; end if;

  select b.name into v_business from public.businesses b where b.id = p_tenant;

  return jsonb_build_object(
    'business_name', coalesce(v_business, 'our business'),
    'rating', v_row.rating,
    'customer_feedback', left(coalesce(v_row.customer_feedback, ''), 1000),
    'owner_reply_status', v_row.owner_reply_status,
    'has_draft', v_row.owner_reply_draft is not null
  );
end;
$$;

revoke all on function public.review_reply_context(uuid, uuid) from public, anon;
grant execute on function public.review_reply_context(uuid, uuid) to authenticated;

-- Customers who use the Google link do not submit FlowSuite feedback. Staff can
-- record the published rating/review text so the AI has a real source to answer.
create or replace function public.review_reply_set_source(
  p_tenant uuid,
  p_request uuid,
  p_rating integer,
  p_feedback text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_feedback text := nullif(btrim(coalesce(p_feedback, '')), '');
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Access denied';
  end if;
  if not public.has_tenant_role(p_tenant, array['owner', 'admin', 'manager']) then
    raise exception 'Manager role required to record review details';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Rating must be 1-5';
  end if;
  if length(coalesce(v_feedback, '')) > 1000 then
    raise exception 'Review text is too long';
  end if;
  if not exists (
    select 1 from public.review_requests
     where id = p_request and tenant_id = p_tenant
  ) then
    raise exception 'Review request not found';
  end if;

  update public.review_requests
     set rating = p_rating,
         customer_feedback = v_feedback,
         feedback_submitted_at = coalesce(feedback_submitted_at, now()),
         updated_at = now()
   where id = p_request and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_actor, 'review_reply.source_added', 'review_request', p_request::text,
    jsonb_build_object('rating', p_rating, 'has_feedback', v_feedback is not null)
  );
end;
$$;

revoke all on function public.review_reply_set_source(uuid, uuid, integer, text) from public, anon;
grant execute on function public.review_reply_set_source(uuid, uuid, integer, text) to authenticated;

create or replace function public.review_reply_save_draft(
  p_tenant uuid,
  p_request uuid,
  p_draft text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft text := btrim(coalesce(p_draft, ''));
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_status not in ('generated', 'fallback') then
    raise exception 'Invalid draft status';
  end if;
  if length(v_draft) < 10 or length(v_draft) > 600 then
    raise exception 'Invalid draft length';
  end if;
  if not exists (
    select 1 from public.review_requests
     where id = p_request and tenant_id = p_tenant
  ) then
    raise exception 'Review request not found';
  end if;

  update public.review_requests
     set owner_reply_draft = v_draft,
         owner_reply_status = p_status,
         owner_reply_approved_by = null,
         owner_reply_approved_at = null,
         owner_reply_copied_at = null,
         updated_at = now()
   where id = p_request and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, null, 'review_reply.generated', 'review_request', p_request::text,
    jsonb_build_object('ai_assisted', true, 'status', p_status)
  );
end;
$$;

revoke all on function public.review_reply_save_draft(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_reply_save_draft(uuid, uuid, text, text) to service_role;

create or replace function public.review_reply_set_status(
  p_tenant uuid,
  p_request uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_row record;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Access denied';
  end if;
  if not public.has_tenant_role(p_tenant, array['owner', 'admin', 'manager']) then
    raise exception 'Manager role required to update review replies';
  end if;
  if p_status not in ('approved', 'rejected', 'copied') then
    raise exception 'Invalid status';
  end if;

  select owner_reply_status, owner_reply_draft
    into v_row
    from public.review_requests
   where id = p_request and tenant_id = p_tenant
   for update;
  if not found or v_row.owner_reply_draft is null then raise exception 'Review reply draft not found'; end if;
  if v_row.owner_reply_status in ('not_requested', 'rejected') then
    raise exception 'No active draft to update';
  end if;

  update public.review_requests
     set owner_reply_status = p_status,
         owner_reply_approved_by = case when p_status = 'approved' then v_actor else owner_reply_approved_by end,
         owner_reply_approved_at = case when p_status = 'approved' then now() else owner_reply_approved_at end,
         owner_reply_copied_at = case when p_status = 'copied' then now() else owner_reply_copied_at end,
         updated_at = now()
   where id = p_request and tenant_id = p_tenant;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_actor, 'review_reply.' || p_status, 'review_request', p_request::text,
    jsonb_build_object('ai_assisted', true, 'status', p_status)
  );
end;
$$;

revoke all on function public.review_reply_set_status(uuid, uuid, text) from public, anon;
grant execute on function public.review_reply_set_status(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Safe UI list. Direct table SELECT is revoked so no tenant member can read
--    owner_reply_draft; this RPC returns only the fields the review card needs.
-- ---------------------------------------------------------------------------
create or replace function public.review_requests_list_for_ui(p_tenant uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Access denied';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'tenant_id', r.tenant_id,
        'customer_name', r.customer_name,
        'customer_phone', r.customer_phone,
        'channel', r.channel,
        'review_link_type', r.review_link_type,
        'review_url', r.review_url,
        'status', r.status,
        'rating', r.rating,
        'customer_feedback', r.customer_feedback,
        'ai_suggestion_status', r.ai_suggestion_status,
        'public_token', r.public_token,
        'scheduled_for', r.scheduled_for,
        'created_at', r.created_at
      )
      order by r.created_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select *
      from public.review_requests
     where tenant_id = p_tenant
     order by created_at desc
     limit 50
  ) r;

  return v_result;
end;
$$;

revoke all on function public.review_requests_list_for_ui(uuid) from public, anon;
grant execute on function public.review_requests_list_for_ui(uuid) to authenticated;

revoke select on public.review_requests from authenticated;

-- Upgrade existing installs of the Painter 4 template only. Custom or renamed
-- workflows keep their chosen link type. The runner resolves the tenant URL.
update public.workflows w
   set actions = (
         select coalesce(
           jsonb_agg(
             case
               when a.value ->> 'type' = 'send_review_request'
                    and coalesce(a.value -> 'config' ->> 'review_link_type', 'flowsuite') = 'flowsuite'
                    and nullif(btrim(coalesce(a.value -> 'config' ->> 'review_url', '')), '') is null
                 then jsonb_set(a.value, '{config,review_link_type}', '"google"', false)
               else a.value
             end
             order by a.ord
           ),
           '[]'::jsonb
         )
         from jsonb_array_elements(coalesce(w.actions, '[]'::jsonb)) with ordinality as a(value, ord)
       ),
       updated_at = now()
 where w.name = 'Painter - 4. Google Review Request'
   and w.trigger_type = 'appointment_completed'
   and exists (
     select 1
     from jsonb_array_elements(coalesce(w.actions, '[]'::jsonb)) as a(value)
     where a.value ->> 'type' = 'send_review_request'
       and coalesce(a.value -> 'config' ->> 'review_link_type', 'flowsuite') = 'flowsuite'
       and nullif(btrim(coalesce(a.value -> 'config' ->> 'review_url', '')), '') is null
   );

-- ---------------------------------------------------------------------------
-- 5. Appointment-completed runner: resolve tenant Google review URL
-- ---------------------------------------------------------------------------
create or replace function public.workflows_handle_appointment_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workflow record;
  v_action jsonb;
  v_channel text;
  v_delay_hours numeric;
  v_review_link_type text;
  v_review_url text;
  v_tenant_review_url text;
  v_template text;
  v_customer_name text;
  v_contact_phone text;
  v_contact_email text;
  v_exists boolean;
  v_token text;
  v_contact_first text;
  v_contact_last text;
begin
  if tg_op <> 'UPDATE' then return new; end if;
  if new.status <> 'completed' then return new; end if;
  if old.status is not distinct from new.status then return new; end if;

  for v_workflow in
    select id, actions
    from public.workflows
    where tenant_id = new.tenant_id
      and trigger_type = 'appointment_completed'
      and status = 'active'
  loop
    for v_action in
      select value as action from jsonb_array_elements(coalesce(v_workflow.actions, '[]'::jsonb))
    loop
      if coalesce(v_action ->> 'type', '') <> 'send_review_request' then continue; end if;

      v_channel := case when coalesce(v_action -> 'config' ->> 'channel', '') in ('whatsapp', 'sms', 'email')
        then v_action -> 'config' ->> 'channel' else 'whatsapp' end;
      v_delay_hours := coalesce((v_action -> 'config' ->> 'delay_hours')::numeric, 2);
      if v_delay_hours < 0 then v_delay_hours := 0; end if;
      v_review_link_type := case when coalesce(v_action -> 'config' ->> 'review_link_type', 'flowsuite') in ('flowsuite', 'google', 'custom')
        then v_action -> 'config' ->> 'review_link_type' else 'flowsuite' end;
      v_review_url := nullif(btrim(coalesce(v_action -> 'config' ->> 'review_url', '')), '');
      v_template := nullif(btrim(coalesce(v_action -> 'config' ->> 'value', '')), '');

      -- Resolve the tenant's own Google link. Fail closed to FlowSuite if absent.
      if v_review_link_type = 'google' and v_review_url is null then
        select google_review_url into v_tenant_review_url
          from public.businesses
         where id = new.tenant_id;
        if v_tenant_review_url is not null and btrim(v_tenant_review_url) <> '' then
          v_review_url := v_tenant_review_url;
        else
          v_review_link_type := 'flowsuite';
          insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
          values (
            new.tenant_id, null, 'review_request.google_link_missing', 'appointment', new.id::text,
            jsonb_build_object('workflow_id', v_workflow.id, 'link_type', 'flowsuite_fallback')
          );
        end if;
      end if;

      -- Google links must be Google-hosted. Custom links keep the existing
      -- behaviour: whatever the tenant configured in the action is preserved.
      if v_review_link_type = 'google' and not public.is_google_review_url(v_review_url) then
        v_review_link_type := 'flowsuite';
        v_review_url := null;
        insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
        values (
          new.tenant_id, null, 'review_request.google_link_missing', 'appointment', new.id::text,
          jsonb_build_object('workflow_id', v_workflow.id, 'link_type', 'flowsuite_fallback', 'reason', 'invalid_or_missing_google_url')
        );
      end if;

      select exists(
        select 1 from public.review_requests rr
         where rr.tenant_id = new.tenant_id
           and rr.appointment_id = new.id
           and rr.workflow_id = v_workflow.id
           and rr.channel = v_channel
      ) into v_exists;
      if v_exists then continue; end if;

      v_customer_name := coalesce(nullif(btrim(coalesce(new.customer_name, '')), ''), null);
      v_contact_phone := nullif(btrim(coalesce(new.customer_phone, '')), '');
      v_contact_email := nullif(btrim(coalesce(new.customer_email, '')), '');

      if new.contact_id is not null then
        select c.first_name, c.last_name, c.phone, c.email
          into v_contact_first, v_contact_last, v_contact_phone, v_contact_email
          from public.contacts c
         where c.id = new.contact_id and c.tenant_id = new.tenant_id;
        if found then
          v_customer_name := coalesce(v_customer_name, nullif(btrim(concat_ws(' ', v_contact_first, v_contact_last)), ''));
          v_contact_phone := coalesce(nullif(btrim(coalesce(v_contact_phone,'')), ''), nullif(btrim(coalesce(new.customer_phone,'')), ''));
          v_contact_email := coalesce(nullif(btrim(coalesce(v_contact_email,'')), ''), nullif(btrim(coalesce(new.customer_email,'')), ''));
        else
          v_contact_phone := nullif(btrim(coalesce(new.customer_phone, '')), '');
          v_contact_email := nullif(btrim(coalesce(new.customer_email, '')), '');
        end if;
      end if;

      v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

      insert into public.review_requests (
        tenant_id, workflow_id, appointment_id, contact_id,
        customer_name, customer_phone, customer_email,
        channel, review_link_type, review_url, message_template,
        status, scheduled_for, public_token
      ) values (
        new.tenant_id, v_workflow.id, new.id, new.contact_id,
        v_customer_name, v_contact_phone, v_contact_email,
        v_channel, v_review_link_type, v_review_url, v_template,
        'pending_approval', now() + make_interval(secs => (v_delay_hours * 3600)::int), v_token
      );

      update public.workflows
         set run_count = run_count + 1, last_run_at = now(), updated_at = now()
       where id = v_workflow.id and tenant_id = new.tenant_id;
    end loop;
  end loop;

  return new;
end;
$$;

commit;
