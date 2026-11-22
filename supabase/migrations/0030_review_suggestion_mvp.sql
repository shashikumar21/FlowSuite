-- Review suggestion MVP: tokenized FlowSuite review link + feedback capture.
-- LOCAL ONLY until explicit approval. No external sends. AI suggestion generated
-- server-side by Edge Function when configured.

begin;

alter table public.review_requests
  add column if not exists public_token text,
  add column if not exists rating integer check (rating between 1 and 5),
  add column if not exists customer_feedback text,
  add column if not exists ai_suggestion text,
  add column if not exists ai_suggestion_status text not null default 'not_requested'
    check (ai_suggestion_status in ('not_requested','generated','fallback','error')),
  add column if not exists feedback_submitted_at timestamptz,
  add column if not exists review_link_clicked_at timestamptz;

create unique index if not exists review_requests_public_token_idx
  on public.review_requests(public_token) where public_token is not null;

-- Staff: create/get a FlowSuite review link for an existing review request.
create or replace function public.review_request_ensure_token(p_tenant uuid, p_request uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_token text;
begin
  if not public.has_tenant_access(p_tenant) then raise exception 'Access denied'; end if;
  select public_token into v_token from public.review_requests
  where id = p_request and tenant_id = p_tenant for update;
  if not found then raise exception 'Review request not found'; end if;
  if v_token is null then
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    update public.review_requests set public_token = v_token, updated_at = now()
    where id = p_request and tenant_id = p_tenant;
  end if;
  return v_token;
end;
$$;

-- Public: fetch review request by token (no tenant leakage).
create or replace function public.public_review_get(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row record; v_business text;
begin
  select r.id, r.tenant_id, r.customer_name, r.rating, r.customer_feedback, r.ai_suggestion,
         r.ai_suggestion_status, r.feedback_submitted_at, r.review_link_type, r.review_url, r.status
  into v_row
  from public.review_requests r
  where r.public_token = p_token;
  if not found then return null; end if;
  select b.name into v_business from public.businesses b where b.id = v_row.tenant_id;
  return jsonb_build_object(
    'id', v_row.id,
    'business_name', coalesce(v_business, 'Business'),
    'customer_name', v_row.customer_name,
    'rating', v_row.rating,
    'customer_feedback', v_row.customer_feedback,
    'ai_suggestion', v_row.ai_suggestion,
    'ai_suggestion_status', v_row.ai_suggestion_status,
    'feedback_submitted_at', v_row.feedback_submitted_at,
    'review_link_type', v_row.review_link_type,
    'review_url', v_row.review_url,
    'status', v_row.status
  );
end;
$$;

-- Public: submit rating/feedback. AI suggestion is stored separately by edge function.
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
declare v_id uuid;
begin
  if p_rating < 1 or p_rating > 5 then raise exception 'Rating must be 1-5'; end if;
  update public.review_requests
  set rating = p_rating,
      customer_feedback = nullif(btrim(coalesce(p_feedback,'')), ''),
      feedback_submitted_at = coalesce(feedback_submitted_at, now()),
      updated_at = now()
  where public_token = p_token
  returning id into v_id;
  if not found then raise exception 'Review link not found'; end if;
  return jsonb_build_object('id', v_id, 'rating', p_rating);
end;
$$;

-- Public: mark review link clicked.
create or replace function public.public_review_mark_clicked(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.review_requests
  set review_link_clicked_at = coalesce(review_link_clicked_at, now()), updated_at = now()
  where public_token = p_token;
end;
$$;

revoke all on function public.review_request_ensure_token(uuid,uuid) from public, anon;
revoke all on function public.public_review_get(text) from public;
revoke all on function public.public_review_submit_feedback(text,integer,text) from public;
revoke all on function public.public_review_mark_clicked(text) from public;
grant execute on function public.review_request_ensure_token(uuid,uuid) to authenticated;
grant execute on function public.public_review_get(text) to anon, authenticated;
grant execute on function public.public_review_submit_feedback(text,integer,text) to anon, authenticated;
grant execute on function public.public_review_mark_clicked(text) to anon, authenticated;

commit;
