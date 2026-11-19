-- ============================================================================
-- 0002_business_configuration.sql
-- Industry templates, business settings and branches
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Industry template catalogue (shared reference data, not tenant-owned)
-- ---------------------------------------------------------------------------
create table public.industry_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  icon text,
  configuration_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.template_modules (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.industry_templates(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default false,
  configuration_json jsonb not null default '{}'::jsonb,
  unique (template_id, module_key)
);

-- ---------------------------------------------------------------------------
-- 2. Per-tenant configuration
-- ---------------------------------------------------------------------------
create table public.business_settings (
  tenant_id uuid primary key references public.businesses(id) on delete cascade,
  enable_online_bookings boolean not null default true,
  enable_whatsapp boolean not null default false,
  default_locale text not null default 'en',
  currency text not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  business_hours jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger business_settings_set_updated_at
before update on public.business_settings
for each row execute function public.set_updated_at();

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  address text,
  phone text,
  is_primary boolean not null default false,
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create index branches_tenant_idx on public.branches(tenant_id);

create trigger branches_set_updated_at
before update on public.branches
for each row execute function public.set_updated_at();

create table public.business_template_settings (
  tenant_id uuid primary key references public.businesses(id) on delete cascade,
  template_id uuid not null references public.industry_templates(id),
  overrides_json jsonb not null default '{}'::jsonb,
  applied_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Apply a template to a new tenant (server-side, role checked)
-- ---------------------------------------------------------------------------
create or replace function public.apply_industry_template(p_tenant_id uuid, p_template_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template public.industry_templates%rowtype;
  v_pipeline_id uuid;
  v_stage text;
  v_position integer := 0;
begin
  if not public.has_tenant_role(p_tenant_id, array['owner', 'admin']) then
    raise exception 'Only owners and admins can apply an industry template';
  end if;

  select t.* into v_template
  from public.industry_templates t
  where t.slug = p_template_slug and t.active = true;

  if not found then
    raise exception 'Unknown industry template';
  end if;

  insert into public.business_template_settings (tenant_id, template_id, overrides_json)
  values (p_tenant_id, v_template.id, '{}'::jsonb)
  on conflict (tenant_id) do update
    set template_id = excluded.template_id,
        applied_at = now();

  insert into public.business_settings (tenant_id, default_locale, timezone, business_hours)
  values (
    p_tenant_id,
    'en',
    'Asia/Kolkata',
    coalesce(v_template.configuration_json -> 'business_hours', '[]'::jsonb)
  )
  on conflict (tenant_id) do nothing;

  if not exists (select 1 from public.pipelines p where p.tenant_id = p_tenant_id and p.name = 'Default') then
    insert into public.pipelines (tenant_id, name, is_default)
    values (p_tenant_id, 'Default', true)
    returning id into v_pipeline_id;

    for v_stage in
      select s.value
      from jsonb_array_elements_text(
        coalesce(v_template.configuration_json -> 'pipeline_stages', '["New", "Qualified", "Won"]'::jsonb)
      ) as s(value)
    loop
      insert into public.pipeline_stages (tenant_id, pipeline_id, name, position, probability)
      values (
        p_tenant_id,
        v_pipeline_id,
        v_stage,
        v_position,
        least(100, (v_position + 1) * 20)
      );
      v_position := v_position + 1;
    end loop;
  end if;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    (select auth.uid()),
    'template.applied',
    'industry_template',
    v_template.id::text,
    jsonb_build_object('slug', p_template_slug)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS and grants
-- ---------------------------------------------------------------------------
alter table public.industry_templates enable row level security;
alter table public.template_modules enable row level security;
alter table public.business_settings enable row level security;
alter table public.branches enable row level security;
alter table public.business_template_settings enable row level security;

create policy "Authenticated users view active industry templates"
  on public.industry_templates for select to authenticated
  using (active = true);

create policy "Authenticated users view template modules"
  on public.template_modules for select to authenticated
  using (
    exists (
      select 1 from public.industry_templates t
      where t.id = template_modules.template_id and t.active = true
    )
  );

create policy "Tenant business settings access" on public.business_settings for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));
create policy "Tenant branches access" on public.branches for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));
create policy "Tenant template settings access" on public.business_template_settings for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));

revoke all on public.industry_templates,
  public.template_modules,
  public.business_settings,
  public.branches,
  public.business_template_settings from anon;

grant select on public.industry_templates, public.template_modules to authenticated;
grant select, insert, update, delete on public.business_settings, public.branches, public.business_template_settings to authenticated;

revoke all on function public.apply_industry_template(uuid, text) from public;
grant execute on function public.apply_industry_template(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Reference data — industry templates (not customer data)
-- ---------------------------------------------------------------------------
insert into public.industry_templates (name, slug, description, icon, configuration_json)
values
  (
    'Dental Clinic', 'dental-clinic',
    'Appointment slots, treatment follow-ups and patient enquiries.',
    'smile',
    '{"pipeline_stages": ["New enquiry", "Appointment booked", "Visited", "Treatment plan", "Patient"], "business_hours": [{"day": 1, "open": "09:00", "close": "18:00"}, {"day": 2, "open": "09:00", "close": "18:00"}, {"day": 3, "open": "09:00", "close": "18:00"}, {"day": 4, "open": "09:00", "close": "18:00"}, {"day": 5, "open": "09:00", "close": "18:00"}, {"day": 6, "open": "09:00", "close": "14:00"}], "booking_label": "Appointment", "widgets": ["appointments", "new_enquiries", "follow_ups"]}'::jsonb
  ),
  (
    'Medical Clinic', 'medical-clinic',
    'Doctor schedules, appointment reminders and patient follow-ups.',
    'stethoscope',
    '{"pipeline_stages": ["New enquiry", "Appointment booked", "Consulted", "Follow-up", "Patient"], "booking_label": "Consultation", "widgets": ["appointments", "new_enquiries", "follow_ups"]}'::jsonb
  ),
  (
    'Salon & Spa', 'salon-spa',
    'Stylist schedules, service packages and repeat bookings.',
    'scissors',
    '{"pipeline_stages": ["New enquiry", "Booked", "Visited", "Repeat customer"], "booking_label": "Service booking", "widgets": ["appointments", "revenue", "repeat_customers"]}'::jsonb
  ),
  (
    'Restaurant', 'restaurant',
    'Table enquiries, reservations and promotions.',
    'utensils',
    '{"pipeline_stages": ["Enquiry", "Reservation", "Visited", "Regular"], "booking_label": "Table reservation", "widgets": ["reservations", "enquiries", "campaigns"]}'::jsonb
  ),
  (
    'Gym & Fitness', 'gym-fitness',
    'Memberships, renewals and trial sessions.',
    'dumbbell',
    '{"pipeline_stages": ["Trial lead", "Trial session", "Member", "Renewal due"], "booking_label": "Trial session", "widgets": ["memberships", "renewals", "trials"]}'::jsonb
  ),
  (
    'Real Estate', 'real-estate',
    'Property enquiries, lead stages and site visits.',
    'building-2',
    '{"pipeline_stages": ["New enquiry", "Contacted", "Site visit", "Negotiation", "Closed"], "booking_label": "Site visit", "widgets": ["deals", "site_visits", "lead_sources"]}'::jsonb
  ),
  (
    'Jewellery', 'jewellery',
    'Product enquiries, appointments and customer follow-ups.',
    'gem',
    '{"pipeline_stages": ["New enquiry", "Appointment", "Visited", "Purchased"], "booking_label": "Showroom visit", "widgets": ["appointments", "enquiries", "follow_ups"]}'::jsonb
  ),
  (
    'Coaching Centre', 'coaching-centre',
    'Student enquiries, demo classes and admissions.',
    'graduation-cap',
    '{"pipeline_stages": ["New enquiry", "Demo class", "Interested", "Admitted"], "booking_label": "Demo class", "widgets": ["enquiries", "demo_classes", "admissions"]}'::jsonb
  ),
  (
    'Automobile Dealer', 'automobile-dealer',
    'Vehicle enquiries, test drives and service reminders.',
    'car',
    '{"pipeline_stages": ["New enquiry", "Contacted", "Test drive", "Booking", "Delivered"], "booking_label": "Test drive", "widgets": ["deals", "test_drives", "service_reminders"]}'::jsonb
  ),
  (
    'Home Services', 'home-services',
    'Service requests, technician assignment and job tracking.',
    'wrench',
    '{"pipeline_stages": ["New request", "Assigned", "In progress", "Completed"], "booking_label": "Service visit", "widgets": ["requests", "assigned_jobs", "completion_rate"]}'::jsonb
  )
on conflict (slug) do nothing;

insert into public.template_modules (template_id, module_key, enabled)
select t.id, m.module_key, m.enabled
from public.industry_templates t
cross join (
  values
    ('crm', true),
    ('appointments', true),
    ('inbox', true),
    ('automation', true),
    ('marketing', false),
    ('reputation', false),
    ('websites', false),
    ('payments', false),
    ('ai_agents', false)
) as m(module_key, enabled)
on conflict (template_id, module_key) do nothing;
