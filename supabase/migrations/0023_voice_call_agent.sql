-- Voice / AI Call Agent module: provider-agnostic call logs, agent config,
-- transcripts and handoffs. NEW FILE ONLY - no earlier migration is edited.
-- LOCAL ONLY - not applied to hosted.
--
-- Contract:
-- * Browser code has SELECT only on tenant-owned tables. Writes go through
--   SECURITY DEFINER RPCs that check has_tenant_access() first.
-- * No telephony provider is configured. Provider fields are references only;
--   secrets must never be stored in tables or sent to the browser.
-- * No call is placed, no recording is fetched, and no AI gives medical advice.
-- * Destructive deletes require can_manage_sales_agent() (owner/admin).

begin;

create table if not exists public.voice_agents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  direction text not null default 'inbound' check (direction in ('inbound', 'outbound', 'both')),
  languages text[] not null default array['en','hi']::text[],
  greeting text,
  faq_summary text,
  booking_mode text not null default 'lead_capture' check (booking_mode in ('lead_capture', 'booking_assist', 'disabled')),
  handoff_phone text,
  provider text not null default 'none' check (provider in ('none', 'exotel', 'twilio', 'other')),
  provider_phone_number text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create trigger voice_agents_set_updated_at
  before update on public.voice_agents
  for each row execute function public.set_updated_at();

create table if not exists public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  agent_id uuid,
  contact_id uuid,
  direction text not null check (direction in ('inbound', 'outbound')),
  status text not null default 'logged' check (status in ('logged', 'queued', 'ringing', 'in_progress', 'completed', 'missed', 'failed', 'cancelled')),
  provider text not null default 'manual' check (provider in ('manual', 'exotel', 'twilio', 'other')),
  provider_call_id text,
  from_number text,
  to_number text,
  language text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  outcome text,
  summary text,
  consent_recording boolean not null default false,
  needs_handoff boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (agent_id, tenant_id) references public.voice_agents(id, tenant_id) on delete set null,
  foreign key (contact_id, tenant_id) references public.contacts(id, tenant_id) on delete set null
);

create trigger call_sessions_set_updated_at
  before update on public.call_sessions
  for each row execute function public.set_updated_at();

create table if not exists public.call_transcripts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  call_session_id uuid not null,
  speaker text not null check (speaker in ('caller', 'agent', 'staff', 'system')),
  message text not null check (length(btrim(message)) between 1 and 4000),
  language text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (call_session_id, tenant_id) references public.call_sessions(id, tenant_id) on delete cascade
);

create table if not exists public.call_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  call_session_id uuid not null,
  event_type text not null check (length(btrim(event_type)) between 1 and 80),
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (call_session_id, tenant_id) references public.call_sessions(id, tenant_id) on delete cascade
);

create table if not exists public.call_handoffs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  call_session_id uuid not null,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'assigned', 'resolved', 'cancelled')),
  assigned_to uuid,
  notes text,
  resolved_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (call_session_id, tenant_id) references public.call_sessions(id, tenant_id) on delete cascade
);

create trigger call_handoffs_set_updated_at
  before update on public.call_handoffs
  for each row execute function public.set_updated_at();

create index if not exists voice_agents_tenant_idx on public.voice_agents(tenant_id, created_at desc);
create index if not exists call_sessions_tenant_idx on public.call_sessions(tenant_id, started_at desc nulls last, created_at desc);
create index if not exists call_transcripts_session_idx on public.call_transcripts(tenant_id, call_session_id, occurred_at asc);
create index if not exists call_events_session_idx on public.call_events(tenant_id, call_session_id, created_at asc);
create index if not exists call_handoffs_tenant_idx on public.call_handoffs(tenant_id, status, created_at desc);

alter table public.voice_agents enable row level security;
alter table public.call_sessions enable row level security;
alter table public.call_transcripts enable row level security;
alter table public.call_events enable row level security;
alter table public.call_handoffs enable row level security;

create policy "Voice: read agents" on public.voice_agents for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Voice: read call sessions" on public.call_sessions for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Voice: read transcripts" on public.call_transcripts for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Voice: read call events" on public.call_events for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Voice: read handoffs" on public.call_handoffs for select to authenticated using (public.has_tenant_access(tenant_id));

revoke all on public.voice_agents, public.call_sessions, public.call_transcripts, public.call_events, public.call_handoffs from public, anon, authenticated;
grant select on public.voice_agents, public.call_sessions, public.call_transcripts, public.call_events, public.call_handoffs to authenticated;

create or replace function public.voice_upsert_agent(
  p_tenant uuid,
  p_agent uuid,
  p_name text,
  p_status text,
  p_direction text,
  p_languages text[],
  p_greeting text,
  p_faq_summary text,
  p_booking_mode text,
  p_handoff_phone text,
  p_provider text,
  p_provider_phone_number text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_id uuid;
  v_langs text[];
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Invalid agent name'; end if;
  if coalesce(p_status, '') not in ('draft','active','paused','archived') then raise exception 'Invalid agent status'; end if;
  if coalesce(p_direction, '') not in ('inbound','outbound','both') then raise exception 'Invalid direction'; end if;
  if coalesce(p_booking_mode, '') not in ('lead_capture','booking_assist','disabled') then raise exception 'Invalid booking mode'; end if;
  if coalesce(p_provider, '') not in ('none','exotel','twilio','other') then raise exception 'Invalid provider'; end if;
  v_langs := array(select distinct lower(btrim(x)) from unnest(coalesce(p_languages, array['en']::text[])) x where btrim(x) <> '');
  if coalesce(array_length(v_langs,1),0) = 0 then v_langs := array['en']; end if;

  if p_agent is null then
    insert into public.voice_agents (
      tenant_id, name, status, direction, languages, greeting, faq_summary, booking_mode, handoff_phone, provider, provider_phone_number, created_by
    ) values (
      p_tenant, btrim(p_name), p_status, p_direction, v_langs,
      nullif(btrim(coalesce(p_greeting,'')),''), nullif(btrim(coalesce(p_faq_summary,'')),''),
      p_booking_mode, nullif(btrim(coalesce(p_handoff_phone,'')),''),
      p_provider, nullif(btrim(coalesce(p_provider_phone_number,'')),''), v_caller
    ) returning id into v_id;
    insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
    values (p_tenant, v_caller, 'voice.agent_created', 'voice_agent', v_id::text, jsonb_build_object('status', p_status));
  else
    if not exists (select 1 from public.voice_agents a where a.id = p_agent and a.tenant_id = p_tenant) then
      raise exception 'Voice agent not found in this business';
    end if;
    update public.voice_agents set
      name=btrim(p_name), status=p_status, direction=p_direction, languages=v_langs,
      greeting=nullif(btrim(coalesce(p_greeting,'')),''), faq_summary=nullif(btrim(coalesce(p_faq_summary,'')),''),
      booking_mode=p_booking_mode, handoff_phone=nullif(btrim(coalesce(p_handoff_phone,'')),''),
      provider=p_provider, provider_phone_number=nullif(btrim(coalesce(p_provider_phone_number,'')),'')
    where id=p_agent and tenant_id=p_tenant returning id into v_id;
    insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
    values (p_tenant, v_caller, 'voice.agent_updated', 'voice_agent', v_id::text, jsonb_build_object('status', p_status));
  end if;
  return v_id;
end;
$$;

create or replace function public.voice_log_call_session(
  p_tenant uuid,
  p_agent uuid,
  p_contact uuid,
  p_direction text,
  p_status text,
  p_provider text,
  p_from_number text,
  p_to_number text,
  p_language text,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_duration_seconds integer,
  p_outcome text,
  p_summary text,
  p_consent_recording boolean,
  p_needs_handoff boolean
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
  if coalesce(p_direction,'') not in ('inbound','outbound') then raise exception 'Invalid direction'; end if;
  if coalesce(p_status,'') not in ('logged','queued','ringing','in_progress','completed','missed','failed','cancelled') then raise exception 'Invalid call status'; end if;
  if coalesce(p_provider,'') not in ('manual','exotel','twilio','other') then raise exception 'Invalid provider'; end if;
  if p_agent is not null and not exists (select 1 from public.voice_agents a where a.id=p_agent and a.tenant_id=p_tenant) then raise exception 'Voice agent not found'; end if;
  if p_contact is not null and not exists (select 1 from public.contacts c where c.id=p_contact and c.tenant_id=p_tenant) then raise exception 'Contact not found'; end if;

  insert into public.call_sessions (
    tenant_id, agent_id, contact_id, direction, status, provider, from_number, to_number, language,
    started_at, ended_at, duration_seconds, outcome, summary, consent_recording, needs_handoff, created_by
  ) values (
    p_tenant, p_agent, p_contact, p_direction, p_status, p_provider,
    nullif(btrim(coalesce(p_from_number,'')),''), nullif(btrim(coalesce(p_to_number,'')),''), nullif(btrim(coalesce(p_language,'')),''),
    p_started_at, p_ended_at, p_duration_seconds,
    nullif(btrim(coalesce(p_outcome,'')),''), nullif(btrim(coalesce(p_summary,'')),''),
    coalesce(p_consent_recording,false), coalesce(p_needs_handoff,false), v_caller
  ) returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'voice.call_logged', 'call_session', v_id::text, jsonb_build_object('status', p_status, 'direction', p_direction));
  return v_id;
end;
$$;

create or replace function public.voice_create_handoff(
  p_tenant uuid,
  p_call_session uuid,
  p_reason text,
  p_assigned_to uuid,
  p_notes text
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
  if not exists (select 1 from public.call_sessions s where s.id=p_call_session and s.tenant_id=p_tenant) then raise exception 'Call session not found'; end if;
  if length(btrim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'Invalid handoff reason'; end if;
  if p_assigned_to is not null and not exists (select 1 from public.business_members bm where bm.tenant_id=p_tenant and bm.user_id=p_assigned_to and bm.status='active') then
    raise exception 'Assignee is not an active member of this business';
  end if;
  insert into public.call_handoffs (tenant_id, call_session_id, reason, status, assigned_to, notes, created_by)
  values (p_tenant, p_call_session, btrim(p_reason), case when p_assigned_to is null then 'open' else 'assigned' end, p_assigned_to, nullif(btrim(coalesce(p_notes,'')),''), v_caller)
  returning id into v_id;
  update public.call_sessions set needs_handoff = true where id=p_call_session and tenant_id=p_tenant;
  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'voice.handoff_created', 'call_handoff', v_id::text, jsonb_build_object('call_session_id', p_call_session));
  return v_id;
end;
$$;

create or replace function public.voice_resolve_handoff(p_tenant uuid, p_handoff uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_caller uuid := (select auth.uid());
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  update public.call_handoffs set status='resolved', resolved_at=now()
  where id=p_handoff and tenant_id=p_tenant and status in ('open','assigned');
  if not found then raise exception 'Handoff not found'; end if;
  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, v_caller, 'voice.handoff_resolved', 'call_handoff', p_handoff::text);
end;
$$;

revoke all on function public.voice_upsert_agent(uuid,uuid,text,text,text,text[],text,text,text,text,text,text) from public, anon;
grant execute on function public.voice_upsert_agent(uuid,uuid,text,text,text,text[],text,text,text,text,text,text) to authenticated;
revoke all on function public.voice_log_call_session(uuid,uuid,uuid,text,text,text,text,text,text,timestamptz,timestamptz,integer,text,text,boolean,boolean) from public, anon;
grant execute on function public.voice_log_call_session(uuid,uuid,uuid,text,text,text,text,text,text,timestamptz,timestamptz,integer,text,text,boolean,boolean) to authenticated;
revoke all on function public.voice_create_handoff(uuid,uuid,text,uuid,text) from public, anon;
grant execute on function public.voice_create_handoff(uuid,uuid,text,uuid,text) to authenticated;
revoke all on function public.voice_resolve_handoff(uuid,uuid) from public, anon;
grant execute on function public.voice_resolve_handoff(uuid,uuid) to authenticated;

commit;
