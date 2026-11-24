-- Tenant-owned Razorpay collection for manual invoices.
-- LOCAL ONLY: no hosted writes, no provider calls, no keys stored here.
--
-- Each business saves its own Razorpay keys in the encrypted integration vault.
-- Browser code can only call tenant-scoped read RPCs. Every write path is a
-- SECURITY DEFINER RPC restricted to service_role and reached only from a
-- signature-verified Edge Function. No ciphertext, key secret or webhook secret
-- is ever returned to a client or written to an audit row.

begin;

-- ---------------------------------------------------------------------------
-- 1. Extend existing enums (preserves the original rows and constraints)
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'integration_secrets'
      and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%provider%'
  loop
    execute format('alter table public.integration_secrets drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.integration_secrets
  add constraint integration_secrets_provider_check
  check (provider in ('openai', 'whatsapp', 'resend', 'exotel', 'netlify', 'vercel', 'razorpay', 'other'));

do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'invoice_payments'
      and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%method%'
  loop
    execute format('alter table public.invoice_payments drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.invoice_payments
  add constraint invoice_payments_method_check
  check (method in ('cash', 'upi', 'card', 'bank_transfer', 'razorpay', 'other'));

-- ---------------------------------------------------------------------------
-- 2. Orders created for an invoice — service role writes only
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_payment_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null,
  provider text not null default 'razorpay' check (provider = 'razorpay'),
  provider_order_id text not null unique,
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR',
  receipt text not null check (length(receipt) between 1 and 40),
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'cancelled')),
  provider_payment_id text,
  failure_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (id, tenant_id),
  foreign key (invoice_id, tenant_id) references public.invoices(id, tenant_id) on delete cascade
);

create index if not exists invoice_payment_orders_tenant_idx
  on public.invoice_payment_orders(tenant_id, invoice_id, created_at desc);

create trigger invoice_payment_orders_set_updated_at
  before update on public.invoice_payment_orders
  for each row execute function public.set_updated_at();

alter table public.invoice_payment_orders enable row level security;
revoke all on public.invoice_payment_orders from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Webhook idempotency ledger — service role writes only
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.businesses(id) on delete cascade,
  provider_event_id text not null unique,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.invoice_payment_webhook_events enable row level security;
revoke all on public.invoice_payment_webhook_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Tenant-scoped read RPCs (metadata only; no secrets, no ciphertext)
-- ---------------------------------------------------------------------------
create or replace function public.payments_gateway_status(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_keys integer := 0;
  v_webhook integer := 0;
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Access denied';
  end if;

  select count(*) into v_keys
  from public.integration_secrets s
  where s.tenant_id = p_tenant and s.provider = 'razorpay'
    and s.secret_name in ('RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET')
    and s.status = 'connected' and coalesce(s.ciphertext, '') <> '';

  select count(*) into v_webhook
  from public.integration_secrets s
  where s.tenant_id = p_tenant and s.provider = 'razorpay'
    and s.secret_name = 'RAZORPAY_WEBHOOK_SECRET'
    and s.status = 'connected' and coalesce(s.ciphertext, '') <> '';

  return jsonb_build_object(
    'configured', v_keys = 2 and v_webhook = 1,
    'keys_configured', v_keys = 2,
    'webhook_configured', v_webhook = 1
  );
end;
$$;

create or replace function public.payments_list_invoice_orders(p_tenant uuid, p_invoice uuid)
returns table (
  id uuid,
  provider_order_id text,
  amount_paise integer,
  currency text,
  status text,
  created_at timestamptz,
  paid_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.has_tenant_access(p_tenant) then
    raise exception 'Access denied';
  end if;
  if not exists (
    select 1 from public.invoices i where i.id = p_invoice and i.tenant_id = p_tenant
  ) then
    raise exception 'Invoice not found in this business';
  end if;

  return query
  select o.id, o.provider_order_id, o.amount_paise, o.currency, o.status, o.created_at, o.paid_at
  from public.invoice_payment_orders o
  where o.tenant_id = p_tenant and o.invoice_id = p_invoice
  order by o.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Service-role RPCs — signature-verified Edge Functions only
-- ---------------------------------------------------------------------------
create or replace function public.payments_service_create_invoice_order(
  p_tenant uuid,
  p_invoice uuid,
  p_provider_order_id text,
  p_amount_paise integer,
  p_currency text,
  p_receipt text,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_due_paise integer;
  v_id uuid;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required to record an invoice payment order';
  end if;
  if nullif(btrim(coalesce(p_provider_order_id, '')), '') is null
    or length(p_provider_order_id) > 120 then
    raise exception 'Invalid provider order id';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'Invalid payment order amount';
  end if;
  if nullif(btrim(coalesce(p_currency, '')), '') is null or length(p_currency) > 10 then
    raise exception 'Invalid currency';
  end if;
  if nullif(btrim(coalesce(p_receipt, '')), '') is null or length(p_receipt) > 40 then
    raise exception 'Invalid receipt';
  end if;

  select * into v_invoice
  from public.invoices i
  where i.id = p_invoice and i.tenant_id = p_tenant
  for update;
  if not found then raise exception 'Invoice not found in this business'; end if;
  if v_invoice.status = 'void' then raise exception 'Invoice is void'; end if;
  if upper(v_invoice.currency) <> upper(p_currency) then
    raise exception 'Currency mismatch';
  end if;

  v_due_paise := round(greatest(v_invoice.total_amount - v_invoice.amount_paid, 0) * 100)::integer;
  if v_due_paise <= 0 then raise exception 'Invoice has no balance due'; end if;
  if p_amount_paise <> v_due_paise then
    raise exception 'Payment amount does not match the invoice balance';
  end if;

  insert into public.invoice_payment_orders (
    tenant_id, invoice_id, provider_order_id, amount_paise, currency, receipt, created_by
  ) values (
    p_tenant, p_invoice, btrim(p_provider_order_id), p_amount_paise, upper(btrim(p_currency)),
    btrim(p_receipt), p_created_by
  )
  returning id into v_id;

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, p_created_by, 'payments.invoice_order_created', 'invoice_payment_order', v_id::text,
    jsonb_build_object(
      'invoice_id', p_invoice, 'provider', 'razorpay',
      'amount_paise', p_amount_paise, 'currency', upper(btrim(p_currency)),
      'external_call', true, 'auto_send', false
    )
  );
  return v_id;
end;
$$;

create or replace function public.payments_service_record_online_payment(
  p_tenant uuid,
  p_provider_order_id text,
  p_provider_payment_id text,
  p_amount_paise integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.invoice_payment_orders%rowtype;
  v_reference text;
  v_payment_id uuid;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required to record an online payment';
  end if;
  if nullif(btrim(coalesce(p_provider_payment_id, '')), '') is null
    or length(p_provider_payment_id) > 100 then
    raise exception 'Invalid provider payment id';
  end if;

  select * into v_order
  from public.invoice_payment_orders
  where provider_order_id = p_provider_order_id
  for update;
  if not found then raise exception 'Invoice payment order not found'; end if;
  if v_order.tenant_id <> p_tenant then raise exception 'Invoice payment order tenant mismatch'; end if;
  if p_amount_paise is null or p_amount_paise <> v_order.amount_paise then
    raise exception 'Paid amount does not match the order';
  end if;

  v_reference := 'razorpay:' || btrim(p_provider_payment_id);

  -- Idempotent: checkout verification and the webhook can both deliver this.
  select id into v_payment_id
  from public.invoice_payments
  where tenant_id = p_tenant and reference = v_reference;
  if v_payment_id is not null then
    return v_payment_id;
  end if;

  if v_order.status = 'paid' then
    raise exception 'Order already paid with a different payment';
  end if;
  if v_order.status = 'failed' then
    raise exception 'Order was marked failed';
  end if;

  insert into public.invoice_payments (
    tenant_id, invoice_id, amount, method, reference, paid_at, notes, created_by
  ) values (
    p_tenant, v_order.invoice_id, round(p_amount_paise::numeric / 100, 2),
    'razorpay', v_reference, now(), null, v_order.created_by
  )
  returning id into v_payment_id;

  update public.invoice_payment_orders
  set status = 'paid', provider_payment_id = btrim(p_provider_payment_id),
      failure_reason = null, paid_at = now()
  where id = v_order.id;

  perform public.payments_refresh_invoice_status(p_tenant, v_order.invoice_id);

  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant, v_order.created_by, 'payments.invoice_paid_online', 'invoice_payment', v_payment_id::text,
    jsonb_build_object(
      'invoice_id', v_order.invoice_id, 'provider', 'razorpay',
      'order_id', p_provider_order_id, 'amount_paise', p_amount_paise,
      'external_call', true, 'auto_send', false
    )
  );
  return v_payment_id;
end;
$$;

create or replace function public.payments_service_mark_invoice_order_failed(
  p_provider_order_id text,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required to update an invoice payment order';
  end if;
  update public.invoice_payment_orders
  set status = 'failed', failure_reason = left(coalesce(p_error, 'payment_failed'), 300)
  where provider_order_id = p_provider_order_id and status = 'created';
end;
$$;

create or replace function public.payments_service_record_invoice_webhook_event(
  p_tenant uuid,
  p_provider_event_id text,
  p_event_type text,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required to record a webhook event';
  end if;
  if nullif(btrim(coalesce(p_provider_event_id, '')), '') is null
    or length(p_provider_event_id) > 200 then
    raise exception 'Invalid provider event id';
  end if;

  insert into public.invoice_payment_webhook_events (
    tenant_id, provider_event_id, event_type, payload
  ) values (
    p_tenant, btrim(p_provider_event_id), left(coalesce(p_event_type, 'unknown'), 120),
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (provider_event_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function public.payments_service_finish_invoice_webhook_event(
  p_provider_event_id text,
  p_status text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required to finish a webhook event';
  end if;
  update public.invoice_payment_webhook_events
  set status = p_status, error = left(p_error, 500), processed_at = now()
  where provider_event_id = p_provider_event_id;
end;
$$;

-- Supabase default privileges can grant EXECUTE directly to anon/authenticated,
-- so revoking only PUBLIC is not sufficient.
revoke all on function public.payments_gateway_status(uuid) from public, anon;
grant execute on function public.payments_gateway_status(uuid) to authenticated;

revoke all on function public.payments_list_invoice_orders(uuid, uuid) from public, anon;
grant execute on function public.payments_list_invoice_orders(uuid, uuid) to authenticated;

revoke all on function public.payments_service_create_invoice_order(uuid, uuid, text, integer, text, text, uuid) from public, anon, authenticated;
grant execute on function public.payments_service_create_invoice_order(uuid, uuid, text, integer, text, text, uuid) to service_role;

revoke all on function public.payments_service_record_online_payment(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.payments_service_record_online_payment(uuid, text, text, integer) to service_role;

revoke all on function public.payments_service_mark_invoice_order_failed(text, text) from public, anon, authenticated;
grant execute on function public.payments_service_mark_invoice_order_failed(text, text) to service_role;

revoke all on function public.payments_service_record_invoice_webhook_event(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.payments_service_record_invoice_webhook_event(uuid, text, text, jsonb) to service_role;

revoke all on function public.payments_service_finish_invoice_webhook_event(text, text, text) from public, anon, authenticated;
grant execute on function public.payments_service_finish_invoice_webhook_event(text, text, text) to service_role;

commit;
