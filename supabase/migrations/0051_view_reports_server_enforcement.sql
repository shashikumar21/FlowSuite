-- ============================================================================
-- 0051_view_reports_server_enforcement.sql
--
-- ReportsPage gates navigation with can('view_reports') (owner/admin/manager),
-- but the underlying metric RPCs only checked tenant membership. An employee
-- with tenant access could call those RPCs directly and read report figures.
--
-- This forward-only migration adds the same role check inside the trusted
-- server functions. It preserves tenant isolation and existing grants.
-- ============================================================================

create or replace function public.crm_dashboard_metrics(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sources jsonb;
  v_stages jsonb;
  v_recent jsonb;
begin
  if not public.has_tenant_role(p_tenant, array['owner', 'admin', 'manager']) then
    return '{}'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('label', x.label, 'count', x.cnt) order by x.cnt desc), '[]'::jsonb)
  into v_sources
  from (
    select coalesce(ls.name, c.source, 'Unknown') as label, count(*) as cnt
    from public.contacts c
    left join public.lead_sources ls on ls.id = c.source_id and ls.tenant_id = c.tenant_id
    where c.tenant_id = p_tenant
      and c.status = 'lead'
      and public.can_view_contact(p_tenant, c.id)
    group by 1
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
           'stage', x.name, 'count', x.cnt, 'value', x.val, 'position', x.pos
         ) order by x.pos), '[]'::jsonb)
  into v_stages
  from (
    select s.name, s.position as pos, count(d.id) as cnt, coalesce(sum(d.value), 0) as val
    from public.pipeline_stages s
    left join public.deals d
      on d.tenant_id = s.tenant_id
     and d.stage_id = s.id
     and public.can_view_deal(p_tenant, d.id)
    where s.tenant_id = p_tenant
    group by s.id, s.name, s.position
  ) x;

  select coalesce(jsonb_agg(x.obj order by x.occurred_at desc), '[]'::jsonb)
  into v_recent
  from (
    select jsonb_build_object(
             'id', a.id, 'type', a.type, 'subject', a.subject, 'body', a.body,
             'contact_id', a.contact_id, 'deal_id', a.deal_id,
             'occurred_at', a.occurred_at, 'created_at', a.created_at
           ) as obj,
           a.occurred_at
    from public.contact_activities a
    where a.tenant_id = p_tenant
      and public.can_view_activity(p_tenant, a.id)
    order by a.occurred_at desc
    limit 8
  ) x;

  return jsonb_build_object(
    'total_contacts', (
      select count(*) from public.contacts c
      where c.tenant_id = p_tenant and public.can_view_contact(p_tenant, c.id)
    ),
    'new_leads', (
      select count(*) from public.contacts c
      where c.tenant_id = p_tenant and c.status = 'lead' and c.lead_status = 'new'
        and public.can_view_contact(p_tenant, c.id)
    ),
    'qualified_leads', (
      select count(*) from public.contacts c
      where c.tenant_id = p_tenant and c.lead_status = 'qualified'
        and public.can_view_contact(p_tenant, c.id)
    ),
    'open_deals', (
      select count(*) from public.deals d
      where d.tenant_id = p_tenant and d.status = 'open'
        and public.can_view_deal(p_tenant, d.id)
    ),
    'won_deals', (
      select count(*) from public.deals d
      where d.tenant_id = p_tenant and d.status = 'won'
        and public.can_view_deal(p_tenant, d.id)
    ),
    'open_pipeline_value', (
      select coalesce(sum(d.value), 0) from public.deals d
      where d.tenant_id = p_tenant and d.status = 'open'
        and public.can_view_deal(p_tenant, d.id)
    ),
    'leads_by_source', v_sources,
    'deals_by_stage', v_stages,
    'recent_activities', v_recent
  );
end;
$$;

create or replace function public.booking_dashboard_metrics(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.has_tenant_role(p_tenant, array['owner', 'admin', 'manager']) then
    return '{}'::jsonb;
  end if;

  select jsonb_build_object(
    'today_count', count(*) filter (
      where start_at >= now() and start_at < now() + interval '1 day'
        and status not in ('cancelled', 'no_show')),
    'upcoming_count', count(*) filter (
      where start_at >= now() and status in ('pending', 'scheduled', 'confirmed')),
    'pending_count', count(*) filter (where status = 'pending'),
    'completed_count', count(*) filter (where status = 'completed'),
    'cancelled_count', count(*) filter (where status = 'cancelled'),
    'no_show_count', count(*) filter (where status = 'no_show'),
    'week_count', count(*) filter (
      where start_at >= now() and start_at < now() + interval '7 days'
        and status not in ('cancelled', 'no_show'))
  ) into v_result
  from public.appointments
  where tenant_id = p_tenant;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

create or replace function public.inbox_metrics(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.has_tenant_role(p_tenant, array['owner', 'admin', 'manager']) then
    return '{}'::jsonb;
  end if;

  select jsonb_build_object(
    'open_count', count(*) filter (where status = 'open'),
    'pending_count', count(*) filter (where status = 'pending'),
    'closed_count', count(*) filter (where status = 'closed'),
    'unassigned_count', count(*) filter (where assigned_to is null)
  ) into v_result
  from public.conversations
  where tenant_id = p_tenant;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

create or replace function public.sales_dashboard_metrics(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_tenant_role(p_tenant, array['owner', 'admin', 'manager']) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'total_prospects', (select count(*) from public.prospects where tenant_id = p_tenant),
    'new_prospects', (select count(*) from public.prospects where tenant_id = p_tenant and lead_status = 'new'),
    'verified_contacts', (
      (select count(*) from public.prospects where tenant_id = p_tenant and verification_status = 'verified')
      + (select count(*) from public.decision_makers where tenant_id = p_tenant and verification_status = 'verified')
    ),
    'active_campaigns', (select count(*) from public.outreach_campaigns where tenant_id = p_tenant and status = 'active'),
    'emails_sent', (select count(*) from public.outreach_outbox where tenant_id = p_tenant and status = 'sent'),
    'replies_received', (select count(*) from public.outreach_replies where tenant_id = p_tenant),
    'interested_prospects', (
      select count(distinct prospect_id) from public.outreach_replies
      where tenant_id = p_tenant and classification = 'interested'
    ),
    'converted_customers', (select count(*) from public.prospects where tenant_id = p_tenant and converted_at is not null),
    'saved_searches', (select count(*) from public.prospect_searches where tenant_id = p_tenant)
  );
end;
$$;

create or replace function public.billing_get_usage(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usage jsonb;
begin
  if (select auth.uid()) is null
     or (not public.has_tenant_role(p_tenant, array['owner', 'admin', 'manager'])
         and not public.is_platform_admin(array['super_admin'])) then
    raise exception 'Not allowed to view usage for this business';
  end if;

  select jsonb_build_object(
    'contacts', (select count(*)::integer from public.contacts where tenant_id = p_tenant),
    'employees', (select count(*)::integer from public.business_members where tenant_id = p_tenant and status = 'active'),
    'branches', (select count(*)::integer from public.branches where tenant_id = p_tenant),
    'messages', (select count(*)::integer from public.messages where tenant_id = p_tenant and created_at >= date_trunc('month', now())),
    'workflow_runs', (select count(*)::integer from public.workflow_runs where tenant_id = p_tenant and created_at >= date_trunc('month', now())),
    'ai_credits', (select coalesce(sum(total_tokens), 0)::integer from public.ai_usage_logs where tenant_id = p_tenant and created_at >= date_trunc('month', now())),
    'period_start', date_trunc('month', now())
  ) into v_usage;

  return v_usage;
end;
$$;
