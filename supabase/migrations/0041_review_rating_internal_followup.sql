-- Public review rating: internal follow-up task only (LOCAL ONLY).
--
-- Contract:
-- * 1-3 stars stay on the FlowSuite private feedback page.
-- * 4 stars stays on the FlowSuite suggestion page with a manual Google link.
-- * 5 stars opens the configured Google review URL from the browser.
-- * Submitting a rating creates one internal task and in-app notices for
--   owners/admins/managers. No WhatsApp, email, SMS or public Google reply is
--   sent automatically.
-- * This migration is not applied to hosted without explicit approval.

begin;

create or replace function public.public_review_submit_feedback(
  p_token text,
  p_rating integer,
  p_feedback text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_tenant uuid;
  v_customer text;
  v_previous_submitted_at timestamptz;
  v_task_id uuid;
  v_title text;
  v_body text;
  v_recipient record;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be 1-5';
  end if;
  if nullif(btrim(coalesce(p_token, '')), '') is null then
    raise exception 'Review link not found';
  end if;
  if length(coalesce(p_feedback, '')) > 4000 then
    raise exception 'Feedback must be 4000 characters or fewer';
  end if;

  select r.feedback_submitted_at
  into v_previous_submitted_at
  from public.review_requests r
  where r.public_token = p_token
  for update;
  if not found then raise exception 'Review link not found'; end if;

  update public.review_requests r
  set rating = p_rating,
      customer_feedback = nullif(btrim(coalesce(p_feedback, '')), ''),
      feedback_submitted_at = coalesce(r.feedback_submitted_at, now()),
      updated_at = now()
  where r.public_token = p_token
  returning r.id, r.tenant_id, r.customer_name
  into v_id, v_tenant, v_customer;

  -- One internal follow-up per review request. Resubmitting feedback updates
  -- the stored rating/feedback but does not create duplicate tasks or notices.
  if v_previous_submitted_at is null then
    v_title := case when p_rating <= 3
      then 'Follow up on low customer rating'
      else 'Reply to customer rating'
    end || format(' (%s/5)', p_rating);

    v_body := 'Customer: ' || coalesce(nullif(btrim(v_customer), ''), 'Customer')
      || E'\nRating: ' || p_rating || '/5'
      || E'\nFeedback: ' || coalesce(nullif(btrim(p_feedback), ''), '(none)')
      || E'\n\nInternal follow-up only. No message was sent automatically.'
      || E' Review and reply through your approved process.';

    insert into public.tasks (tenant_id, title, description, status, created_by, due_at)
    values (
      v_tenant,
      left(v_title, 200),
      v_body,
      'pending',
      null,
      now() + case when p_rating <= 3 then interval '1 day' else interval '2 days' end
    )
    returning id into v_task_id;

    for v_recipient in
      select bm.user_id
      from public.business_members bm
      where bm.tenant_id = v_tenant
        and bm.status = 'active'
        and bm.role in ('owner', 'admin', 'manager')
    loop
      insert into public.notifications (
        tenant_id, user_id, notification_type, title, body,
        entity_type, entity_id, delivery_channel, delivery_status
      ) values (
        v_tenant, v_recipient.user_id, 'workflow_notification',
        'Customer rating submitted',
        format('%s rated %s/5. Open Tasks to reply.', coalesce(nullif(btrim(v_customer), ''), 'A customer'), p_rating),
        'review_request', v_id, 'in_app', 'sent'
      );
    end loop;

    insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      v_tenant, null, 'review_request.rating_followup_created',
      'review_request', v_id::text,
      jsonb_build_object(
        'rating', p_rating,
        'task_id', v_task_id,
        'auto_send', false,
        'external_reply', false
      )
    );
  end if;

  return jsonb_build_object(
    'id', v_id,
    'rating', p_rating,
    'follow_up_task_created', v_previous_submitted_at is null
  );
end;
$$;

revoke all on function public.public_review_submit_feedback(text, integer, text) from public;
grant execute on function public.public_review_submit_feedback(text, integer, text) to anon, authenticated;

commit;
