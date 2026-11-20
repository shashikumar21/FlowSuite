-- Milestone 4: AI communication foundation.
--
-- Design rules (continues the M2/M3 contract):
-- * Tenant identity is always derived from the authenticated membership for
--   member-facing RPCs. Provider-facing RPCs are service-role only and take an
--   explicit tenant that was resolved by an Edge Function from a verified
--   credential or webhook subscription.
-- * RLS remains authoritative for direct table access. Trusted RPCs are
--   SECURITY DEFINER with a pinned search_path and re-check membership/roles.
-- * Provider secrets are never stored here. `channel_credentials.secret_ref`
--   holds a server-side secret reference name; raw tokens belong in Supabase
--   secrets. Nothing in this migration is browser-callable except
--   `ai_get_public_agent`, which returns only approved public-safe data.
-- * Every inbound provider event is deduplicated with
--   `webhook_events(provider, external_id)`; every outbound message and
--   follow-up carries an idempotency key.
-- * AI may only update CRM records through validated, allowlisted RPCs. It can
--   never execute arbitrary SQL or code. No lead scores are invented.
--
begin;

-- ---------------------------------------------------------------------------
-- 1. Permission helpers
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_ai(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_tenant_role(p_tenant, array['owner', 'admin']);
$$;

comment on function public.can_manage_ai(uuid) is
  'True for owner/admin of an active membership. AI configuration writes only.';

create or replace function public.has_consent(
  p_tenant uuid,
  p_contact uuid,
  p_channel text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1
    from public.communication_consents c
    where c.tenant_id = p_tenant
      and c.contact_id = p_contact
      and c.channel = p_channel
      and c.status = 'opt_in'
      and c.revoked_at is null
  );
end;
$$;

comment on function public.has_consent(uuid, uuid, text) is
  'True only for an active, non-revoked opt-in for the tenant, contact and channel.';

-- ---------------------------------------------------------------------------
-- 2. New tenant-owned tables
-- ---------------------------------------------------------------------------

create table public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  language text not null default 'en' check (language in ('en', 'hi', 'te')),
  tone text not null default 'friendly'
    check (tone in ('friendly', 'professional', 'conversational')),
  business_info text,
  working_hours jsonb not null default '{}'::jsonb,
  permissions jsonb not null default '{"answer_faq":true,"qualify_leads":true}'::jsonb,
  booking_permission boolean not null default false,
  handoff_user_id uuid,
  response_style text not null default 'short'
    check (response_style in ('short', 'detailed')),
  monthly_token_limit integer check (monthly_token_limit is null or monthly_token_limit > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  public_key text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, name),
  foreign key (tenant_id, handoff_user_id)
    references public.business_members(tenant_id, user_id) on delete set null
);

alter table public.ai_agents
  add constraint ai_agents_public_key_format check (public_key ~ '^[0-9a-f]{64}$');

create index ai_agents_tenant_idx on public.ai_agents(tenant_id, status);

create trigger ai_agents_set_updated_at
before update on public.ai_agents
for each row execute function public.set_updated_at();

create table public.ai_agent_knowledge (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  agent_id uuid not null,
  category text not null default 'faq'
    check (category in (
      'business_profile', 'service', 'faq', 'opening_hours',
      'booking_policy', 'contact', 'other'
    )),
  title text not null check (length(btrim(title)) between 1 and 200),
  content text not null check (length(btrim(content)) between 1 and 4000),
  language text not null default 'en' check (language in ('en', 'hi', 'te')),
  active boolean not null default true,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (agent_id, tenant_id)
    references public.ai_agents(id, tenant_id) on delete cascade
);

create index ai_agent_knowledge_lookup_idx
  on public.ai_agent_knowledge(tenant_id, agent_id, active, category);

create trigger ai_agent_knowledge_set_updated_at
before update on public.ai_agent_knowledge
for each row execute function public.set_updated_at();

create table public.ai_agent_tools (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  agent_id uuid not null,
  tool_key text not null
    check (tool_key in (
      'answer_faq', 'qualify_lead', 'lookup_services', 'lookup_hours',
      'lookup_availability', 'create_booking', 'create_lead',
      'check_consent', 'send_reply', 'handoff'
    )),
  enabled boolean not null default false,
  requires_confirmation boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, agent_id, tool_key),
  foreign key (agent_id, tenant_id)
    references public.ai_agents(id, tenant_id) on delete cascade
);

create trigger ai_agent_tools_set_updated_at
before update on public.ai_agent_tools
for each row execute function public.set_updated_at();

create table public.channel_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  channel_id uuid not null,
  provider text not null
    check (provider in ('whatsapp', 'openai', 'resend', 'exotel', 'other')),
  -- Name of a Supabase secret. A raw access token or API key is never stored.
  secret_ref text not null
    check (secret_ref ~ '^[A-Z][A-Z0-9_]{2,199}$' and secret_ref not like 'VITE_%'),
  external_identifier text,
  status text not null default 'active'
    check (status in ('active', 'disconnected', 'error')),
  scopes jsonb not null default '[]'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, channel_id, provider),
  foreign key (channel_id, tenant_id)
    references public.channels(id, tenant_id) on delete cascade
);

create index channel_credentials_tenant_idx
  on public.channel_credentials(tenant_id, provider, status);

create trigger channel_credentials_set_updated_at
before update on public.channel_credentials
for each row execute function public.set_updated_at();

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null default 'whatsapp'
    check (provider in ('whatsapp', 'sms', 'email', 'other')),
  template_key text not null check (length(btrim(template_key)) between 1 and 120),
  provider_template_name text,
  language text not null default 'en' check (language in ('en', 'hi', 'te')),
  category text not null default 'utility'
    check (category in (
      'acknowledgement', 'appointment_confirmation', 'reminder',
      'follow_up', 'utility', 'marketing'
    )),
  content text not null check (length(btrim(content)) between 1 and 4000),
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, provider, template_key, language)
);

create trigger message_templates_set_updated_at
before update on public.message_templates
for each row execute function public.set_updated_at();

create table public.communication_consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null,
  channel text not null check (channel in ('whatsapp', 'sms', 'email', 'voice')),
  status text not null check (status in ('opt_in', 'opt_out')),
  source text not null
    check (source in ('website_chat', 'whatsapp', 'manual', 'import', 'staff', 'booking')),
  proof jsonb not null default '{}'::jsonb,
  consented_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, contact_id, channel),
  foreign key (contact_id, tenant_id)
    references public.contacts(id, tenant_id) on delete cascade
);

create index communication_consents_lookup_idx
  on public.communication_consents(tenant_id, contact_id, status);

create trigger communication_consents_set_updated_at
before update on public.communication_consents
for each row execute function public.set_updated_at();

create table public.conversation_handoffs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  conversation_id uuid not null,
  from_user_id uuid references public.profiles(id) on delete set null,
  to_user_id uuid not null,
  reason text,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'completed', 'reverted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  unique (id, tenant_id),
  foreign key (conversation_id, tenant_id)
    references public.conversations(id, tenant_id) on delete cascade,
  foreign key (tenant_id, to_user_id)
    references public.business_members(tenant_id, user_id)
);

create index conversation_handoffs_tenant_idx
  on public.conversation_handoffs(tenant_id, conversation_id, created_at desc);

create table public.ai_lead_assessments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null,
  conversation_id uuid,
  message_id uuid,
  classification text not null
    check (classification in (
      'information_request', 'high_intent', 'future_follow_up',
      'not_interested', 'unknown'
    )),
  intent text,
  summary text not null check (length(btrim(summary)) between 1 and 2000),
  service_interest text,
  follow_up_recommendation text,
  provider text not null default 'openai',
  model text,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (contact_id, tenant_id)
    references public.contacts(id, tenant_id) on delete cascade,
  foreign key (conversation_id, tenant_id)
    references public.conversations(id, tenant_id) on delete set null,
  foreign key (message_id, tenant_id)
    references public.messages(id, tenant_id) on delete set null
);

create index ai_lead_assessments_contact_idx
  on public.ai_lead_assessments(tenant_id, contact_id, created_at desc);

create table public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  agent_id uuid,
  conversation_id uuid,
  channel text not null default 'website_chat'
    check (channel in ('website_chat', 'whatsapp', 'voice', 'internal')),
  provider text not null default 'openai',
  model text,
  operation text not null
    check (operation in ('chat', 'qualify', 'embed', 'tts', 'stt', 'tool')),
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  estimated_cost numeric(12, 6) not null default 0 check (estimated_cost >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  success boolean not null default true,
  error_code text,
  request_id text,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (agent_id, tenant_id)
    references public.ai_agents(id, tenant_id) on delete set null,
  foreign key (conversation_id, tenant_id)
    references public.conversations(id, tenant_id) on delete set null
);

create index ai_usage_logs_tenant_idx
  on public.ai_usage_logs(tenant_id, agent_id, created_at desc);

create table public.ai_follow_up_sequences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  channel text not null check (channel in ('whatsapp', 'sms', 'email')),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, name)
);

create trigger ai_follow_up_sequences_set_updated_at
before update on public.ai_follow_up_sequences
for each row execute function public.set_updated_at();

create table public.ai_follow_up_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  sequence_id uuid not null,
  step_index integer not null check (step_index between 1 and 50),
  delay_minutes integer not null default 0 check (delay_minutes between 0 and 10080),
  template_key text not null check (length(btrim(template_key)) between 1 and 120),
  condition text not null default 'no_reply'
    check (condition in ('no_reply', 'always', 'unqualified_only')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (sequence_id, step_index),
  foreign key (sequence_id, tenant_id)
    references public.ai_follow_up_sequences(id, tenant_id) on delete cascade
);

create trigger ai_follow_up_steps_set_updated_at
before update on public.ai_follow_up_steps
for each row execute function public.set_updated_at();

create table public.ai_follow_up_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null,
  conversation_id uuid,
  sequence_id uuid not null,
  step_id uuid not null,
  channel text not null check (channel in ('whatsapp', 'sms', 'email')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'skipped', 'failed', 'cancelled')),
  due_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  idempotency_key text not null,
  consent_status text,
  provider_message_id text,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key),
  foreign key (contact_id, tenant_id)
    references public.contacts(id, tenant_id) on delete cascade,
  foreign key (conversation_id, tenant_id)
    references public.conversations(id, tenant_id) on delete set null,
  foreign key (sequence_id, tenant_id)
    references public.ai_follow_up_sequences(id, tenant_id) on delete cascade,
  foreign key (step_id, tenant_id)
    references public.ai_follow_up_steps(id, tenant_id) on delete cascade
);

create index ai_follow_up_jobs_due_idx
  on public.ai_follow_up_jobs(status, due_at)
  where status = 'pending';

create trigger ai_follow_up_jobs_set_updated_at
before update on public.ai_follow_up_jobs
for each row execute function public.set_updated_at();

create table public.ai_call_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null default 'exotel',
  provider_call_id text not null,
  direction text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  from_number text,
  to_number text,
  status text not null default 'ringing'
    check (status in ('ringing', 'in_progress', 'completed', 'failed', 'no_answer')),
  contact_id uuid,
  conversation_id uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, provider, provider_call_id),
  foreign key (contact_id, tenant_id)
    references public.contacts(id, tenant_id) on delete set null,
  foreign key (conversation_id, tenant_id)
    references public.conversations(id, tenant_id) on delete set null
);

create trigger ai_call_sessions_set_updated_at
before update on public.ai_call_sessions
for each row execute function public.set_updated_at();

create table public.ai_call_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  session_id uuid not null,
  outcome text,
  summary text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  usage jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (session_id, tenant_id)
    references public.ai_call_sessions(id, tenant_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- 3. Extend existing M3 tables
-- ---------------------------------------------------------------------------

alter table public.webhook_events
  add column if not exists signature_verified boolean not null default false,
  add column if not exists attempts integer not null default 0 check (attempts >= 0),
  add column if not exists last_attempt_at timestamptz;

alter table public.conversations
  add column if not exists ai_status text not null default 'active'
    check (ai_status in ('active', 'paused', 'handed_off', 'closed')),
  add column if not exists ai_handed_off_at timestamptz;

alter table public.messages
  add column if not exists ai_generated boolean not null default false;

create index messages_ai_generated_idx
  on public.messages(tenant_id, conversation_id)
  where ai_generated = true;

-- ---------------------------------------------------------------------------
-- 4. RLS and grants
-- ---------------------------------------------------------------------------

alter table public.ai_agents enable row level security;
alter table public.ai_agent_knowledge enable row level security;
alter table public.ai_agent_tools enable row level security;
alter table public.channel_credentials enable row level security;
alter table public.message_templates enable row level security;
alter table public.communication_consents enable row level security;
alter table public.conversation_handoffs enable row level security;
alter table public.ai_lead_assessments enable row level security;
alter table public.ai_usage_logs enable row level security;
alter table public.ai_follow_up_sequences enable row level security;
alter table public.ai_follow_up_steps enable row level security;
alter table public.ai_follow_up_jobs enable row level security;
alter table public.ai_call_sessions enable row level security;
alter table public.ai_call_logs enable row level security;

-- Configuration: readable by members, writable only by owner/admin.
create policy "AI: read agents" on public.ai_agents
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "AI: manage agents" on public.ai_agents
  for all to authenticated
  using (public.can_manage_ai(tenant_id))
  with check (public.can_manage_ai(tenant_id));

create policy "AI: read knowledge" on public.ai_agent_knowledge
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "AI: manage knowledge" on public.ai_agent_knowledge
  for all to authenticated
  using (public.can_manage_ai(tenant_id))
  with check (public.can_manage_ai(tenant_id));

create policy "AI: read tools" on public.ai_agent_tools
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "AI: manage tools" on public.ai_agent_tools
  for all to authenticated
  using (public.can_manage_ai(tenant_id))
  with check (public.can_manage_ai(tenant_id));

create policy "AI: read credentials" on public.channel_credentials
  for select to authenticated
  using (tenant_id is not null and public.can_manage_ai(tenant_id));
create policy "AI: manage credentials" on public.channel_credentials
  for all to authenticated
  using (public.can_manage_ai(tenant_id))
  with check (public.can_manage_ai(tenant_id));

create policy "AI: read templates" on public.message_templates
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "AI: manage templates" on public.message_templates
  for all to authenticated
  using (public.can_manage_ai(tenant_id))
  with check (public.can_manage_ai(tenant_id));

create policy "AI: read consents" on public.communication_consents
  for select to authenticated using (public.has_tenant_access(tenant_id));

create policy "AI: read handoffs" on public.conversation_handoffs
  for select to authenticated using (public.has_tenant_access(tenant_id));

create policy "AI: read assessments" on public.ai_lead_assessments
  for select to authenticated using (public.has_tenant_access(tenant_id));

create policy "AI: admins read usage" on public.ai_usage_logs
  for select to authenticated
  using (tenant_id is not null and public.can_manage_ai(tenant_id));

create policy "AI: read sequences" on public.ai_follow_up_sequences
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "AI: manage sequences" on public.ai_follow_up_sequences
  for all to authenticated
  using (public.can_manage_ai(tenant_id))
  with check (public.can_manage_ai(tenant_id));

create policy "AI: read steps" on public.ai_follow_up_steps
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "AI: manage steps" on public.ai_follow_up_steps
  for all to authenticated
  using (public.can_manage_ai(tenant_id))
  with check (public.can_manage_ai(tenant_id));

create policy "AI: read follow-up jobs" on public.ai_follow_up_jobs
  for select to authenticated using (public.has_tenant_access(tenant_id));

create policy "AI: read call sessions" on public.ai_call_sessions
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "AI: read call logs" on public.ai_call_logs
  for select to authenticated using (public.has_tenant_access(tenant_id));

revoke all on public.ai_agents,
  public.ai_agent_knowledge,
  public.ai_agent_tools,
  public.channel_credentials,
  public.message_templates,
  public.communication_consents,
  public.conversation_handoffs,
  public.ai_lead_assessments,
  public.ai_usage_logs,
  public.ai_follow_up_sequences,
  public.ai_follow_up_steps,
  public.ai_follow_up_jobs,
  public.ai_call_sessions,
  public.ai_call_logs from anon;

grant select on public.ai_agents,
  public.ai_agent_knowledge,
  public.ai_agent_tools,
  public.channel_credentials,
  public.message_templates,
  public.communication_consents,
  public.conversation_handoffs,
  public.ai_lead_assessments,
  public.ai_usage_logs,
  public.ai_follow_up_sequences,
  public.ai_follow_up_steps,
  public.ai_follow_up_jobs,
  public.ai_call_sessions,
  public.ai_call_logs to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Member-facing trusted RPCs
-- ---------------------------------------------------------------------------

create or replace function public.ai_upsert_agent(
  p_tenant uuid,
  p_name text,
  p_language text default 'en',
  p_tone text default 'friendly',
  p_business_info text default null,
  p_working_hours jsonb default '{}'::jsonb,
  p_permissions jsonb default '{}'::jsonb,
  p_booking_permission boolean default false,
  p_handoff_user_id uuid default null,
  p_response_style text default 'short',
  p_monthly_token_limit integer default null,
  p_status text default 'draft',
  p_agent_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_public_key text;
begin
  if not public.can_manage_ai(p_tenant) then
    raise exception 'Not allowed to configure AI for this business';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120 then
    raise exception 'Agent name must be 1 to 120 characters';
  end if;
  if p_language not in ('en', 'hi', 'te')
    or p_tone not in ('friendly', 'professional', 'conversational')
    or p_response_style not in ('short', 'detailed')
    or p_status not in ('draft', 'active', 'paused') then
    raise exception 'Invalid agent setting';
  end if;
  if p_monthly_token_limit is not null and p_monthly_token_limit <= 0 then
    raise exception 'Monthly token limit must be positive';
  end if;
  if p_handoff_user_id is not null
    and not public.is_active_member(p_tenant, p_handoff_user_id) then
    raise exception 'Handoff user must be an active member of this business';
  end if;
  if p_agent_id is not null and not exists (
    select 1 from public.ai_agents where id = p_agent_id and tenant_id = p_tenant
  ) then
    raise exception 'Agent not found';
  end if;

  if p_agent_id is null then
    v_public_key := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into public.ai_agents (
      tenant_id, name, language, tone, business_info, working_hours, permissions,
      booking_permission, handoff_user_id, response_style, monthly_token_limit,
      status, public_key
    ) values (
      p_tenant, btrim(p_name), p_language, p_tone, p_business_info,
      coalesce(p_working_hours, '{}'::jsonb), coalesce(p_permissions, '{}'::jsonb),
      p_booking_permission, p_handoff_user_id, p_response_style,
      p_monthly_token_limit, p_status, v_public_key
    ) returning id into v_id;

    insert into public.ai_agent_tools (tenant_id, agent_id, tool_key, enabled)
    select p_tenant, v_id, t.tool_key, t.tool_key in ('answer_faq', 'qualify_lead')
    from (values ('answer_faq'), ('qualify_lead'), ('lookup_services'),
      ('lookup_hours'), ('lookup_availability'), ('create_booking'),
      ('create_lead'), ('check_consent'), ('send_reply'), ('handoff')) as t(tool_key);
  else
    update public.ai_agents
    set name = btrim(p_name),
        language = p_language,
        tone = p_tone,
        business_info = p_business_info,
        working_hours = coalesce(p_working_hours, '{}'::jsonb),
        permissions = coalesce(p_permissions, '{}'::jsonb),
        booking_permission = p_booking_permission,
        handoff_user_id = p_handoff_user_id,
        response_style = p_response_style,
        monthly_token_limit = p_monthly_token_limit,
        status = p_status
    where id = p_agent_id and tenant_id = p_tenant
    returning id into v_id;
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()),
    case when p_agent_id is null then 'ai.agent_created' else 'ai.agent_updated' end,
    'ai_agent', v_id::text);
  return v_id;
end;
$$;

create or replace function public.ai_set_agent_status(
  p_tenant uuid,
  p_agent uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_ai(p_tenant) or p_status not in ('draft', 'active', 'paused') then
    raise exception 'Not allowed to change agent status';
  end if;
  update public.ai_agents set status = p_status
  where id = p_agent and tenant_id = p_tenant;
  if not found then raise exception 'Agent not found'; end if;
  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'ai.agent_status_changed', 'ai_agent', p_agent::text);
end;
$$;

create or replace function public.ai_upsert_knowledge(
  p_tenant uuid,
  p_agent uuid,
  p_category text,
  p_title text,
  p_content text,
  p_language text default 'en',
  p_active boolean default true,
  p_knowledge_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.can_manage_ai(p_tenant) then
    raise exception 'Not allowed to manage AI knowledge';
  end if;
  if not exists (select 1 from public.ai_agents where id = p_agent and tenant_id = p_tenant) then
    raise exception 'Agent not found';
  end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 200
    or p_content is null or length(btrim(p_content)) not between 1 and 4000
    or p_category not in ('business_profile', 'service', 'faq', 'opening_hours',
      'booking_policy', 'contact', 'other')
    or p_language not in ('en', 'hi', 'te') then
    raise exception 'Invalid knowledge entry';
  end if;

  if p_knowledge_id is null then
    insert into public.ai_agent_knowledge (
      tenant_id, agent_id, category, title, content, language, active,
      approved_by, approved_at
    ) values (
      p_tenant, p_agent, p_category, btrim(p_title), btrim(p_content),
      p_language, p_active,
      case when p_active then (select auth.uid()) else null end,
      case when p_active then now() else null end
    ) returning id into v_id;
  else
    update public.ai_agent_knowledge
    set category = p_category, title = btrim(p_title), content = btrim(p_content),
        language = p_language, active = p_active,
        approved_by = case when p_active then (select auth.uid()) else null end,
        approved_at = case when p_active
          then coalesce(approved_at, now()) else null end
    where id = p_knowledge_id and tenant_id = p_tenant and agent_id = p_agent
    returning id into v_id;
    if not found then raise exception 'Knowledge entry not found'; end if;
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'ai.knowledge_saved', 'ai_knowledge', v_id::text);
  return v_id;
end;
$$;

create or replace function public.ai_set_tool(
  p_tenant uuid,
  p_agent uuid,
  p_tool_key text,
  p_enabled boolean,
  p_requires_confirmation boolean default false,
  p_config jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.can_manage_ai(p_tenant) then
    raise exception 'Not allowed to configure AI tools';
  end if;
  if p_tool_key not in (
    'answer_faq', 'qualify_lead', 'lookup_services', 'lookup_hours',
    'lookup_availability', 'create_booking', 'create_lead',
    'check_consent', 'send_reply', 'handoff'
  ) then
    raise exception 'Unknown AI tool';
  end if;
  if not exists (select 1 from public.ai_agents where id = p_agent and tenant_id = p_tenant) then
    raise exception 'Agent not found';
  end if;

  insert into public.ai_agent_tools (
    tenant_id, agent_id, tool_key, enabled, requires_confirmation, config
  ) values (
    p_tenant, p_agent, p_tool_key, p_enabled, p_requires_confirmation,
    coalesce(p_config, '{}'::jsonb)
  )
  on conflict (tenant_id, agent_id, tool_key)
  do update set enabled = excluded.enabled,
    requires_confirmation = excluded.requires_confirmation,
    config = excluded.config,
    updated_at = now()
  returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'ai.tool_updated', 'ai_tool', v_id::text);
end;
$$;

create or replace function public.ai_upsert_credential(
  p_tenant uuid,
  p_channel uuid,
  p_provider text,
  p_secret_ref text,
  p_external_identifier text default null,
  p_scopes jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.can_manage_ai(p_tenant) then
    raise exception 'Not allowed to manage provider connections';
  end if;
  if p_secret_ref is null
    or btrim(p_secret_ref) !~ '^[A-Z][A-Z0-9_]{2,199}$'
    or btrim(p_secret_ref) like 'VITE_%' then
    raise exception 'Invalid server-side secret reference';
  end if;
  if p_provider not in ('whatsapp', 'openai', 'resend', 'exotel', 'other') then
    raise exception 'Unknown provider';
  end if;
  if not exists (
    select 1 from public.channels
    where id = p_channel and tenant_id = p_tenant and active = true
  ) then
    raise exception 'Channel not found';
  end if;

  insert into public.channel_credentials (
    tenant_id, channel_id, provider, secret_ref, external_identifier, scopes, status
  ) values (
    p_tenant, p_channel, p_provider, btrim(p_secret_ref), p_external_identifier,
    coalesce(p_scopes, '[]'::jsonb), 'active'
  )
  on conflict (tenant_id, channel_id, provider)
  do update set secret_ref = excluded.secret_ref,
    external_identifier = excluded.external_identifier,
    scopes = excluded.scopes,
    status = 'active',
    updated_at = now()
  returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'ai.credential_updated', 'channel_credential', v_id::text);
  return v_id;
end;
$$;

create or replace function public.ai_upsert_template(
  p_tenant uuid,
  p_template_key text,
  p_content text,
  p_provider text default 'whatsapp',
  p_provider_template_name text default null,
  p_language text default 'en',
  p_category text default 'utility',
  p_status text default 'draft'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.can_manage_ai(p_tenant) then
    raise exception 'Not allowed to manage message templates';
  end if;
  if p_template_key is null or length(btrim(p_template_key)) not between 1 and 120
    or p_content is null or length(btrim(p_content)) not between 1 and 4000
    or p_provider not in ('whatsapp', 'sms', 'email', 'other')
    or p_language not in ('en', 'hi', 'te')
    or p_category not in ('acknowledgement', 'appointment_confirmation', 'reminder',
      'follow_up', 'utility', 'marketing')
    or p_status not in ('draft', 'approved', 'rejected') then
    raise exception 'Invalid message template';
  end if;

  insert into public.message_templates (
    tenant_id, provider, template_key, provider_template_name, language,
    category, content, status, approved_by, approved_at
  ) values (
    p_tenant, p_provider, btrim(p_template_key), p_provider_template_name,
    p_language, p_category, btrim(p_content), p_status,
    case when p_status = 'approved' then (select auth.uid()) else null end,
    case when p_status = 'approved' then now() else null end
  )
  on conflict (tenant_id, provider, template_key, language)
  do update set provider_template_name = excluded.provider_template_name,
    category = excluded.category, content = excluded.content,
    status = excluded.status,
    approved_by = case when excluded.status = 'approved'
      then (select auth.uid()) else null end,
    approved_at = case when excluded.status = 'approved'
      then coalesce(message_templates.approved_at, now()) else null end,
    updated_at = now()
  returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'ai.template_saved', 'message_template', v_id::text);
  return v_id;
end;
$$;

create or replace function public.ai_set_consent(
  p_tenant uuid,
  p_contact uuid,
  p_channel text,
  p_status text,
  p_source text,
  p_proof jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to record consent for this business';
  end if;
  if not exists (select 1 from public.contacts where id = p_contact and tenant_id = p_tenant) then
    raise exception 'Contact not found';
  end if;
  if p_channel not in ('whatsapp', 'sms', 'email', 'voice')
    or p_status not in ('opt_in', 'opt_out')
    or p_source not in ('website_chat', 'whatsapp', 'manual', 'import', 'staff', 'booking') then
    raise exception 'Invalid consent value';
  end if;

  insert into public.communication_consents (
    tenant_id, contact_id, channel, status, source, proof,
    consented_at, revoked_at
  ) values (
    p_tenant, p_contact, p_channel, p_status, p_source,
    coalesce(p_proof, '{}'::jsonb), now(),
    case when p_status = 'opt_out' then now() else null end
  )
  on conflict (tenant_id, contact_id, channel)
  do update set status = excluded.status, source = excluded.source,
    proof = excluded.proof,
    consented_at = case when excluded.status = 'opt_in' then now()
      else communication_consents.consented_at end,
    revoked_at = case when excluded.status = 'opt_out' then now() else null end,
    updated_at = now()
  returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'ai.consent_changed', 'communication_consent', v_id::text);
  return v_id;
end;
$$;

create or replace function public.ai_record_assessment(
  p_tenant uuid,
  p_contact uuid,
  p_classification text,
  p_summary text,
  p_intent text default null,
  p_service_interest text default null,
  p_follow_up_recommendation text default null,
  p_conversation uuid default null,
  p_message uuid default null,
  p_provider text default 'openai',
  p_model text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to record AI assessments for this business';
  end if;
  if not exists (select 1 from public.contacts where id = p_contact and tenant_id = p_tenant) then
    raise exception 'Contact not found';
  end if;
  if p_classification not in ('information_request', 'high_intent',
    'future_follow_up', 'not_interested', 'unknown')
    or p_summary is null or length(btrim(p_summary)) not between 1 and 2000 then
    raise exception 'Invalid assessment';
  end if;
  if p_conversation is not null and not exists (
    select 1 from public.conversations where id = p_conversation and tenant_id = p_tenant
  ) then
    raise exception 'Conversation not found';
  end if;
  if p_message is not null and not exists (
    select 1 from public.messages where id = p_message and tenant_id = p_tenant
  ) then
    raise exception 'Message not found';
  end if;

  insert into public.ai_lead_assessments (
    tenant_id, contact_id, conversation_id, message_id, classification,
    intent, summary, service_interest, follow_up_recommendation, provider, model
  ) values (
    p_tenant, p_contact, p_conversation, p_message, p_classification,
    p_intent, btrim(p_summary), p_service_interest, p_follow_up_recommendation,
    p_provider, p_model
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.ai_latest_assessment(
  p_tenant uuid,
  p_contact uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to read AI assessments for this business';
  end if;
  if not exists (select 1 from public.contacts where id = p_contact and tenant_id = p_tenant) then
    raise exception 'Contact not found';
  end if;

  select jsonb_build_object(
    'id', a.id,
    'classification', a.classification,
    'intent', a.intent,
    'summary', a.summary,
    'service_interest', a.service_interest,
    'follow_up_recommendation', a.follow_up_recommendation,
    'provider', a.provider,
    'model', a.model,
    'created_at', a.created_at
  ) into v_result
  from public.ai_lead_assessments a
  where a.tenant_id = p_tenant and a.contact_id = p_contact
  order by a.created_at desc, a.id desc
  limit 1;
  return coalesce(v_result, '{}'::jsonb);
end;
$$;

create or replace function public.ai_handoff_conversation(
  p_tenant uuid,
  p_conversation uuid,
  p_to_user uuid,
  p_reason text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to hand off conversations for this business';
  end if;
  if not exists (
    select 1 from public.conversations where id = p_conversation and tenant_id = p_tenant
  ) then
    raise exception 'Conversation not found';
  end if;
  if not public.is_active_member(p_tenant, p_to_user) then
    raise exception 'Handoff target must be an active member';
  end if;
  update public.conversations
  set assigned_to = p_to_user,
      ai_status = 'handed_off',
      ai_handed_off_at = now(),
      status = case when status = 'closed' then 'open' else status end
  where id = p_conversation and tenant_id = p_tenant;

  insert into public.conversation_handoffs (
    tenant_id, conversation_id, from_user_id, to_user_id, reason, note
  ) values (
    p_tenant, p_conversation, (select auth.uid()), p_to_user, p_reason, p_note
  ) returning id into v_id;

  insert into public.notifications (
    tenant_id, user_id, notification_type, title, body, entity_type, entity_id
  ) values (
    p_tenant, p_to_user, 'conversation_assigned',
    'An AI conversation was handed over to you',
    p_reason, 'conversation', p_conversation
  );

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'ai.conversation_handoff', 'conversation', p_conversation::text);
  return v_id;
end;
$$;

create or replace function public.ai_set_conversation_ai_status(
  p_tenant uuid,
  p_conversation uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to change AI conversation status';
  end if;
  if p_status not in ('active', 'paused', 'closed') then
    raise exception 'Invalid AI conversation status';
  end if;
  update public.conversations set ai_status = p_status
  where id = p_conversation and tenant_id = p_tenant;
  if not found then raise exception 'Conversation not found'; end if;
  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, (select auth.uid()), 'ai.conversation_status_changed', 'conversation', p_conversation::text);
end;
$$;

create or replace function public.ai_enqueue_follow_up(
  p_tenant uuid,
  p_contact uuid,
  p_sequence uuid,
  p_channel text,
  p_conversation uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step public.ai_follow_up_steps%rowtype;
  v_job uuid;
  v_key text;
  v_consent text;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to enqueue follow-ups for this business';
  end if;
  if not exists (select 1 from public.contacts where id = p_contact and tenant_id = p_tenant) then
    raise exception 'Contact not found';
  end if;
  select s.* into v_step
  from public.ai_follow_up_steps s
  join public.ai_follow_up_sequences q
    on q.id = s.sequence_id and q.tenant_id = s.tenant_id
  where s.tenant_id = p_tenant and s.sequence_id = p_sequence
    and s.step_index = 1 and s.active = true and q.status = 'active';
  if not found then raise exception 'No active first step for this sequence'; end if;
  if p_channel not in ('whatsapp', 'sms', 'email') then
    raise exception 'Invalid follow-up channel';
  end if;
  if p_conversation is not null and exists (
    select 1 from public.conversations
    where id = p_conversation and tenant_id = p_tenant
      and ai_status in ('paused', 'handed_off', 'closed')
  ) then
    raise exception 'Automation is paused for this conversation';
  end if;
  if not public.has_consent(p_tenant, p_contact, p_channel) then
    raise exception 'Consent is required before a follow-up can be queued';
  end if;
  v_consent := 'opt_in';

  v_key := p_tenant::text || '|' || p_sequence::text || '|' || p_contact::text;
  insert into public.ai_follow_up_jobs (
    tenant_id, contact_id, conversation_id, sequence_id, step_id,
    channel, status, due_at, attempts, idempotency_key, consent_status
  ) values (
    p_tenant, p_contact, p_conversation, p_sequence, v_step.id,
    p_channel, 'pending', now() + make_interval(mins => v_step.delay_minutes),
    0, v_key, v_consent
  )
  on conflict (tenant_id, idempotency_key) do nothing
  returning id into v_job;

  if v_job is null then
    select id into v_job from public.ai_follow_up_jobs
    where tenant_id = p_tenant and idempotency_key = v_key;
  end if;
  return v_job;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Public-safe chatbot configuration (the only anon-callable RPC)
-- ---------------------------------------------------------------------------

create or replace function public.ai_get_public_agent(p_public_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_agent public.ai_agents%rowtype;
begin
  if p_public_key is null or p_public_key !~ '^[0-9a-f]{64}$' then
    return '{}'::jsonb;
  end if;

  select * into v_agent
  from public.ai_agents
  where public_key = p_public_key and status = 'active';
  if not found then return '{}'::jsonb; end if;

  return jsonb_build_object(
    'agent_id', v_agent.id,
    'name', v_agent.name,
    'language', v_agent.language,
    'tone', v_agent.tone,
    'response_style', v_agent.response_style,
    'business_info', v_agent.business_info,
    'business_name', (select name from public.businesses where id = v_agent.tenant_id),
    'booking_permission', v_agent.booking_permission,
    'booking_slug', (
      select slug from public.booking_pages
      where tenant_id = v_agent.tenant_id and active = true
      order by created_at limit 1
    ),
    'knowledge', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', k.category, 'title', k.title, 'content', k.content
      ) order by k.created_at)
      from public.ai_agent_knowledge k
      where k.tenant_id = v_agent.tenant_id
        and k.agent_id = v_agent.id
        and k.active = true
        and k.approved_at is not null
    ), '[]'::jsonb),
    'tools', coalesce((
      select jsonb_agg(t.tool_key order by t.tool_key)
      from public.ai_agent_tools t
      where t.tenant_id = v_agent.tenant_id
        and t.agent_id = v_agent.id and t.enabled = true
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Service-role-only RPCs for provider webhooks and workers
-- ---------------------------------------------------------------------------

create or replace function public.ai_record_webhook_event(
  p_tenant uuid,
  p_provider text,
  p_event_type text,
  p_external_id text,
  p_payload jsonb,
  p_signature_verified boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required for webhook ingestion';
  end if;
  if p_provider is null or p_event_type is null or p_external_id is null then
    raise exception 'Invalid webhook event';
  end if;

  begin
    insert into public.webhook_events (
      tenant_id, provider, event_type, external_id, payload,
      status, signature_verified, attempts, last_attempt_at
    ) values (
      p_tenant, p_provider, p_event_type, p_external_id,
      coalesce(p_payload, '{}'::jsonb),
      case when p_signature_verified then 'received' else 'failed' end,
      p_signature_verified, 1, now()
    ) returning id into v_id;
    return jsonb_build_object('id', v_id, 'is_duplicate', false);
  exception when unique_violation then
    select id into v_id from public.webhook_events
    where provider = p_provider and external_id = p_external_id;
    return jsonb_build_object('id', v_id, 'is_duplicate', true);
  end;
end;
$$;

create or replace function public.ai_upsert_contact_from_channel(
  p_tenant uuid,
  p_channel text,
  p_full_name text default null,
  p_phone text default null,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_mobile text;
  v_name text;
  v_last text;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required for channel contact ingestion';
  end if;
  if not exists (select 1 from public.businesses where id = p_tenant) then
    raise exception 'Tenant not found';
  end if;

  v_mobile := case when p_phone is null then null
    else public.normalize_lead_mobile(p_phone) end;
  v_name := nullif(btrim(coalesce(p_full_name, '')), '');

  if v_mobile is not null then
    select id into v_id from public.contacts
    where tenant_id = p_tenant and mobile = v_mobile order by created_at limit 1;
  end if;
  if v_id is null and p_email is not null then
    select id into v_id from public.contacts
    where tenant_id = p_tenant and lower(email) = lower(btrim(p_email))
    order by created_at limit 1;
  end if;
  if v_id is null and v_mobile is not null then
    select id into v_id from public.contacts
    where tenant_id = p_tenant and phone = v_mobile order by created_at limit 1;
  end if;
  if v_id is not null then return v_id; end if;

  v_name := coalesce(v_name, case
    when p_channel = 'whatsapp' then 'WhatsApp' else 'Website' end);
  v_last := null;

  insert into public.contacts (
    tenant_id, first_name, last_name, email, phone, mobile,
    status, lead_status, source
  ) values (
    p_tenant, left(v_name, 200), v_last, nullif(btrim(coalesce(p_email, '')), ''),
    v_mobile, v_mobile, 'lead', 'new', p_channel
  ) returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, null, 'ai.contact_created', 'contact', v_id::text);
  return v_id;
end;
$$;

create or replace function public.ai_find_or_create_conversation(
  p_tenant uuid,
  p_contact uuid,
  p_channel uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_type text;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required for channel conversation ingestion';
  end if;
  select channel_type into v_type from public.channels
  where id = p_channel and tenant_id = p_tenant and active = true;
  if not found then raise exception 'Channel not found'; end if;
  if not exists (select 1 from public.contacts where id = p_contact and tenant_id = p_tenant) then
    raise exception 'Contact not found';
  end if;

  select id into v_id from public.conversations
  where tenant_id = p_tenant and contact_id = p_contact and channel_id = p_channel
    and status in ('open', 'pending')
  order by last_message_at desc nulls last limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.conversations (
    tenant_id, contact_id, channel_id, channel, status, priority, last_message_at
  ) values (
    p_tenant, p_contact, p_channel, v_type, 'open', 'normal', now()
  ) returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, null, 'ai.conversation_created', 'conversation', v_id::text);
  return v_id;
end;
$$;

create or replace function public.ai_append_message(
  p_tenant uuid,
  p_conversation uuid,
  p_direction text,
  p_content text,
  p_author_type text,
  p_external_id text default null,
  p_ai_generated boolean default false,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_type text;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required for channel message ingestion';
  end if;
  if not exists (
    select 1 from public.conversations where id = p_conversation and tenant_id = p_tenant
  ) then
    raise exception 'Conversation not found';
  end if;
  if p_direction not in ('inbound', 'outbound')
    or p_author_type not in ('staff', 'customer', 'system', 'bot')
    or p_content is null or length(btrim(p_content)) = 0 or length(p_content) > 10000 then
    raise exception 'Invalid message';
  end if;
  if p_author_type = 'bot' and p_ai_generated
    and exists (
      select 1 from public.conversations
      where id = p_conversation and tenant_id = p_tenant
        and ai_status in ('paused', 'handed_off', 'closed')
    ) then
    raise exception 'AI replies are paused for this conversation';
  end if;

  if p_external_id is not null then
    select id into v_id from public.messages
    where tenant_id = p_tenant and provider_message_id = p_external_id;
    if v_id is not null then return v_id; end if;
  end if;

  select channel_type into v_type from public.channels c
  join public.conversations conv on conv.channel_id = c.id and conv.tenant_id = c.tenant_id
  where conv.id = p_conversation and conv.tenant_id = p_tenant;

  insert into public.messages (
    tenant_id, conversation_id, direction, message_type, content,
    provider_message_id, delivery_status, author_type, ai_generated, metadata,
    delivered_at
  ) values (
    p_tenant, p_conversation, p_direction,
    case when coalesce(v_type, '') = 'whatsapp' then 'whatsapp' else 'text' end,
    btrim(p_content), p_external_id,
    case when p_direction = 'inbound' then 'sent' else 'pending' end,
    p_author_type, p_ai_generated, coalesce(p_metadata, '{}'::jsonb),
    case when p_direction = 'inbound' then now() else null end
  ) returning id into v_id;

  update public.conversations
  set last_message_at = now(),
      unread_count = case when p_direction = 'inbound' then unread_count + 1 else unread_count end,
      status = case when status = 'closed' then 'open' else status end
  where id = p_conversation and tenant_id = p_tenant;
  return v_id;
end;
$$;

create or replace function public.ai_record_usage(
  p_tenant uuid,
  p_agent uuid,
  p_conversation uuid,
  p_channel text,
  p_provider text,
  p_model text,
  p_operation text,
  p_prompt_tokens integer,
  p_completion_tokens integer,
  p_estimated_cost numeric,
  p_latency_ms integer,
  p_success boolean,
  p_error_code text,
  p_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required for AI usage logging';
  end if;
  if p_channel not in ('website_chat', 'whatsapp', 'voice', 'internal')
    or p_operation not in ('chat', 'qualify', 'embed', 'tts', 'stt', 'tool') then
    raise exception 'Invalid usage log';
  end if;

  insert into public.ai_usage_logs (
    tenant_id, agent_id, conversation_id, channel, provider, model, operation,
    prompt_tokens, completion_tokens, total_tokens, estimated_cost, latency_ms,
    success, error_code, request_id
  ) values (
    p_tenant, p_agent, p_conversation, p_channel, p_provider, p_model, p_operation,
    greatest(coalesce(p_prompt_tokens, 0), 0),
    greatest(coalesce(p_completion_tokens, 0), 0),
    greatest(coalesce(p_prompt_tokens, 0), 0) + greatest(coalesce(p_completion_tokens, 0), 0),
    greatest(coalesce(p_estimated_cost, 0), 0), p_latency_ms,
    coalesce(p_success, true), p_error_code, p_request_id
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.ai_check_usage_limit(p_tenant uuid, p_agent uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_used integer;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Not allowed to inspect AI usage for this business';
  end if;
  select monthly_token_limit into v_limit
  from public.ai_agents where id = p_agent and tenant_id = p_tenant;
  if not found then return false; end if;
  if v_limit is null then return true; end if;

  select coalesce(sum(total_tokens), 0) into v_used
  from public.ai_usage_logs
  where tenant_id = p_tenant and agent_id = p_agent
    and created_at >= date_trunc('month', now());
  return v_used < v_limit;
end;
$$;

create or replace function public.ai_claim_follow_up_job(p_job uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.ai_follow_up_jobs%rowtype;
  v_payload jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required for follow-up processing';
  end if;

  select * into v_row from public.ai_follow_up_jobs
  where id = p_job and status = 'pending' and due_at <= now() and attempts < 3
  for update skip locked;
  if not found then return '{}'::jsonb; end if;

  update public.ai_follow_up_jobs
  set status = 'processing', attempts = attempts + 1, updated_at = now()
  where id = p_job;

  select jsonb_build_object(
    'job_id', v_row.id,
    'tenant_id', v_row.tenant_id,
    'contact_id', v_row.contact_id,
    'conversation_id', v_row.conversation_id,
    'channel', v_row.channel,
    'idempotency_key', v_row.idempotency_key,
    'attempt', v_row.attempts + 1,
    'contact_name', c.first_name || ' ' || coalesce(c.last_name, ''),
    'contact_phone', c.phone,
    'contact_mobile', c.mobile,
    'contact_email', c.email,
    'template', jsonb_build_object(
      'key', t.template_key,
      'provider_name', t.provider_template_name,
      'content', t.content,
      'language', t.language
    )
  ) into v_payload
  from public.contacts c
  left join public.message_templates t
    on t.tenant_id = v_row.tenant_id and t.template_key = (
      select template_key from public.ai_follow_up_steps where id = v_row.step_id
    ) and t.status = 'approved'
  where c.id = v_row.contact_id and c.tenant_id = v_row.tenant_id;
  return coalesce(v_payload, '{}'::jsonb);
end;
$$;

create or replace function public.ai_complete_follow_up_job(
  p_job uuid,
  p_status text,
  p_provider_message_id text default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.ai_follow_up_jobs%rowtype;
  v_next public.ai_follow_up_steps%rowtype;
  v_consent text;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required for follow-up processing';
  end if;
  if p_status not in ('sent', 'skipped', 'failed', 'cancelled') then
    raise exception 'Invalid follow-up job status';
  end if;

  select * into v_row from public.ai_follow_up_jobs
  where id = p_job and status = 'processing';
  if not found then raise exception 'Follow-up job not found or not processing'; end if;

  update public.ai_follow_up_jobs
  set status = p_status,
      provider_message_id = coalesce(p_provider_message_id, provider_message_id),
      last_error = p_error,
      processed_at = now(),
      updated_at = now()
  where id = p_job;

  if p_status <> 'sent' then return; end if;

  select s.* into v_next
  from public.ai_follow_up_steps s
  where s.tenant_id = v_row.tenant_id and s.sequence_id = v_row.sequence_id
    and s.active = true
    and s.step_index > (select step_index from public.ai_follow_up_steps where id = v_row.step_id)
  order by s.step_index limit 1;
  if not found then return; end if;

  if not public.has_consent(v_row.tenant_id, v_row.contact_id, v_row.channel) then
    return;
  end if;
  v_consent := 'opt_in';
  if v_row.conversation_id is not null and exists (
    select 1 from public.conversations
    where id = v_row.conversation_id and tenant_id = v_row.tenant_id
      and ai_status in ('paused', 'handed_off', 'closed')
  ) then
    return;
  end if;

  insert into public.ai_follow_up_jobs (
    tenant_id, contact_id, conversation_id, sequence_id, step_id,
    channel, status, due_at, attempts, idempotency_key, consent_status
  ) values (
    v_row.tenant_id, v_row.contact_id, v_row.conversation_id,
    v_row.sequence_id, v_next.id, v_row.channel, 'pending',
    now() + make_interval(mins => v_next.delay_minutes), 0,
    v_row.tenant_id::text || '|' || v_row.sequence_id::text || '|' ||
      v_row.contact_id::text || '|' || v_next.id::text,
    v_consent
  ) on conflict (tenant_id, idempotency_key) do nothing;
end;
$$;

create or replace function public.ai_upsert_call_session(
  p_tenant uuid,
  p_provider text,
  p_provider_call_id text,
  p_direction text default 'inbound',
  p_from_number text default null,
  p_to_number text default null,
  p_status text default 'ringing',
  p_contact_id uuid default null,
  p_conversation_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required for call session ingestion';
  end if;
  if p_provider is null or p_provider_call_id is null
    or p_direction not in ('inbound', 'outbound')
    or p_status not in ('ringing', 'in_progress', 'completed', 'failed', 'no_answer') then
    raise exception 'Invalid call session';
  end if;

  insert into public.ai_call_sessions (
    tenant_id, provider, provider_call_id, direction, from_number, to_number,
    status, contact_id, conversation_id, metadata, ended_at
  ) values (
    p_tenant, p_provider, p_provider_call_id, p_direction,
    p_from_number, p_to_number, p_status, p_contact_id, p_conversation_id,
    coalesce(p_metadata, '{}'::jsonb),
    case when p_status in ('completed', 'failed', 'no_answer') then now() else null end
  )
  on conflict (tenant_id, provider, provider_call_id)
  do update set status = excluded.status,
    from_number = coalesce(excluded.from_number, ai_call_sessions.from_number),
    to_number = coalesce(excluded.to_number, ai_call_sessions.to_number),
    contact_id = coalesce(excluded.contact_id, ai_call_sessions.contact_id),
    conversation_id = coalesce(excluded.conversation_id, ai_call_sessions.conversation_id),
    metadata = excluded.metadata,
    ended_at = case when excluded.status in ('completed', 'failed', 'no_answer')
      then now() else null end,
    updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Function privileges
-- ---------------------------------------------------------------------------

revoke all on function public.can_manage_ai(uuid) from public;
revoke all on function public.has_consent(uuid, uuid, text) from public;

revoke all on function public.ai_upsert_agent(uuid, text, text, text, text, jsonb, jsonb, boolean, uuid, text, integer, text, uuid) from public;
revoke all on function public.ai_set_agent_status(uuid, uuid, text) from public;
revoke all on function public.ai_upsert_knowledge(uuid, uuid, text, text, text, text, boolean, uuid) from public;
revoke all on function public.ai_set_tool(uuid, uuid, text, boolean, boolean, jsonb) from public;
revoke all on function public.ai_upsert_credential(uuid, uuid, text, text, text, jsonb) from public;
revoke all on function public.ai_upsert_template(uuid, text, text, text, text, text, text, text) from public;
revoke all on function public.ai_set_consent(uuid, uuid, text, text, text, jsonb) from public;
revoke all on function public.ai_record_assessment(uuid, uuid, text, text, text, text, text, uuid, uuid, text, text) from public;
revoke all on function public.ai_latest_assessment(uuid, uuid) from public;
revoke all on function public.ai_handoff_conversation(uuid, uuid, uuid, text, text) from public;
revoke all on function public.ai_set_conversation_ai_status(uuid, uuid, text) from public;
revoke all on function public.ai_enqueue_follow_up(uuid, uuid, uuid, text, uuid) from public;
revoke all on function public.ai_check_usage_limit(uuid, uuid) from public;

grant execute on function public.can_manage_ai(uuid),
  public.has_consent(uuid, uuid, text),
  public.ai_upsert_agent(uuid, text, text, text, text, jsonb, jsonb, boolean, uuid, text, integer, text, uuid),
  public.ai_set_agent_status(uuid, uuid, text),
  public.ai_upsert_knowledge(uuid, uuid, text, text, text, text, boolean, uuid),
  public.ai_set_tool(uuid, uuid, text, boolean, boolean, jsonb),
  public.ai_upsert_credential(uuid, uuid, text, text, text, jsonb),
  public.ai_upsert_template(uuid, text, text, text, text, text, text, text),
  public.ai_set_consent(uuid, uuid, text, text, text, jsonb),
  public.ai_record_assessment(uuid, uuid, text, text, text, text, text, uuid, uuid, text, text),
  public.ai_latest_assessment(uuid, uuid),
  public.ai_handoff_conversation(uuid, uuid, uuid, text, text),
  public.ai_set_conversation_ai_status(uuid, uuid, text),
  public.ai_enqueue_follow_up(uuid, uuid, uuid, text, uuid),
  public.ai_check_usage_limit(uuid, uuid) to authenticated;

revoke all on function public.ai_get_public_agent(text) from public;
grant execute on function public.ai_get_public_agent(text) to anon, authenticated;

revoke all on function public.ai_record_webhook_event(uuid, text, text, text, jsonb, boolean) from public;
revoke all on function public.ai_upsert_contact_from_channel(uuid, text, text, text, text) from public;
revoke all on function public.ai_find_or_create_conversation(uuid, uuid, uuid) from public;
revoke all on function public.ai_append_message(uuid, uuid, text, text, text, text, boolean, jsonb) from public;
revoke all on function public.ai_record_usage(uuid, uuid, uuid, text, text, text, text, integer, integer, numeric, integer, boolean, text, text) from public;
revoke all on function public.ai_claim_follow_up_job(uuid) from public;
revoke all on function public.ai_complete_follow_up_job(uuid, text, text, text) from public;
revoke all on function public.ai_upsert_call_session(uuid, text, text, text, text, text, text, uuid, uuid, jsonb) from public;

grant execute on function public.ai_record_webhook_event(uuid, text, text, text, jsonb, boolean),
  public.ai_upsert_contact_from_channel(uuid, text, text, text, text),
  public.ai_find_or_create_conversation(uuid, uuid, uuid),
  public.ai_append_message(uuid, uuid, text, text, text, text, boolean, jsonb),
  public.ai_record_usage(uuid, uuid, uuid, text, text, text, text, integer, integer, numeric, integer, boolean, text, text),
  public.ai_claim_follow_up_job(uuid),
  public.ai_complete_follow_up_job(uuid, text, text, text),
  public.ai_upsert_call_session(uuid, text, text, text, text, text, text, uuid, uuid, jsonb) to service_role;

commit;
