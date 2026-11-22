-- Payments manual invoice shell: invoices and manual payment records.
-- NEW FILE ONLY — no earlier migration is edited. LOCAL ONLY — not applied to
-- the hosted project until explicit approval.
--
-- Contract:
-- * Browser code has SELECT only on tenant-owned tables. Every write is a
--   SECURITY DEFINER RPC that checks has_tenant_access() first.
-- * No payment provider, gateway, webhook, or external send exists.
-- * Totals and amount_paid are computed/stamped by RPCs; the client cannot
--   write invoice totals or payment-derived status directly.
-- * Destructive deletes require can_manage_sales_agent() (owner/admin).

begin;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid,
  invoice_number text not null,
  title text not null check (length(btrim(title)) between 1 and 200),
  status text not null default 'draft' check (status in ('draft', 'sent', 'partially_paid', 'paid', 'void')),
  currency text not null default 'INR' check (length(btrim(currency)) between 3 and 3),
  issue_date date not null default current_date,
  due_date date,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  tax_amount numeric(12,2) not null default 0 check (tax_amount >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, invoice_number),
  foreign key (contact_id, tenant_id) references public.contacts(id, tenant_id) on delete set null
);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('cash', 'upi', 'card', 'bank_transfer', 'other')),
  reference text,
  paid_at timestamptz not null default now(),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (invoice_id, tenant_id) references public.invoices(id, tenant_id) on delete cascade
);

create index if not exists invoices_tenant_idx on public.invoices(tenant_id, issue_date desc, created_at desc);
create index if not exists invoice_payments_tenant_idx on public.invoice_payments(tenant_id, invoice_id, paid_at desc);

alter table public.invoices enable row level security;
alter table public.invoice_payments enable row level security;

create policy "Invoices: read tenant invoices" on public.invoices
  for select to authenticated using (public.has_tenant_access(tenant_id));
create policy "Invoices: read tenant payments" on public.invoice_payments
  for select to authenticated using (public.has_tenant_access(tenant_id));

revoke all on public.invoices, public.invoice_payments from public, anon, authenticated;
grant select on public.invoices, public.invoice_payments to authenticated;

create or replace function public.payments_compute_invoice_totals(p_items jsonb, p_tax numeric, p_discount numeric)
returns table(subtotal numeric, tax_amount numeric, discount_amount numeric, total_amount numeric)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_subtotal numeric(12,2) := 0;
  v_tax numeric(12,2) := greatest(coalesce(p_tax,0),0);
  v_discount numeric(12,2) := greatest(coalesce(p_discount,0),0);
  v_item jsonb;
  v_qty numeric;
  v_price numeric;
begin
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' then
    raise exception 'Invalid line items';
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
  loop
    v_qty := greatest(coalesce((v_item->>'quantity')::numeric, 0), 0);
    v_price := greatest(coalesce((v_item->>'unit_price')::numeric, 0), 0);
    v_subtotal := v_subtotal + round(v_qty * v_price, 2);
  end loop;
  total_amount := greatest(v_subtotal + v_tax - v_discount, 0);
  subtotal := v_subtotal;
  tax_amount := v_tax;
  discount_amount := v_discount;
  return next;
end;
$$;

create or replace function public.payments_refresh_invoice_status(p_tenant uuid, p_invoice uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric(12,2);
  v_paid numeric(12,2);
  v_status text;
begin
  select coalesce(sum(p.amount),0) into v_paid
  from public.invoice_payments p where p.tenant_id=p_tenant and p.invoice_id=p_invoice;
  select i.total_amount, i.status into v_total, v_status
  from public.invoices i where i.tenant_id=p_tenant and i.id=p_invoice;
  if not found then raise exception 'Invoice not found'; end if;
  if v_status = 'void' then
    update public.invoices set amount_paid = v_paid where id=p_invoice and tenant_id=p_tenant;
    return;
  end if;
  if v_paid <= 0 then v_status := case when v_status = 'sent' then 'sent' else 'draft' end;
  elsif v_paid < v_total then v_status := 'partially_paid';
  else v_status := 'paid';
  end if;
  update public.invoices set amount_paid = v_paid, status = v_status where id=p_invoice and tenant_id=p_tenant;
end;
$$;

create or replace function public.payments_create_invoice(
  p_tenant uuid,
  p_contact uuid,
  p_title text,
  p_status text,
  p_currency text,
  p_issue_date date,
  p_due_date date,
  p_line_items jsonb,
  p_tax_amount numeric,
  p_discount_amount numeric,
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
  v_number text;
  v_tot record;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if length(btrim(coalesce(p_title,''))) not between 1 and 200 then raise exception 'Invalid invoice title'; end if;
  if coalesce(p_status,'') not in ('draft','sent') then raise exception 'Invalid invoice status'; end if;
  if p_contact is not null and not exists (select 1 from public.contacts c where c.id=p_contact and c.tenant_id=p_tenant) then
    raise exception 'Contact not found in this business';
  end if;
  select * into v_tot from public.payments_compute_invoice_totals(coalesce(p_line_items,'[]'::jsonb), coalesce(p_tax_amount,0), coalesce(p_discount_amount,0));
  v_number := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text),1,6));
  insert into public.invoices (
    tenant_id, contact_id, invoice_number, title, status, currency, issue_date, due_date,
    line_items, subtotal, tax_amount, discount_amount, total_amount, amount_paid, notes, created_by
  ) values (
    p_tenant, p_contact, v_number, btrim(p_title), p_status, upper(btrim(coalesce(p_currency,'INR'))),
    coalesce(p_issue_date, current_date), p_due_date,
    coalesce(p_line_items,'[]'::jsonb), v_tot.subtotal, v_tot.tax_amount, v_tot.discount_amount, v_tot.total_amount, 0,
    nullif(btrim(coalesce(p_notes,'')),''), v_caller
  ) returning id into v_id;
  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'payments.invoice_created', 'invoice', v_id::text, jsonb_build_object('status', p_status, 'total', v_tot.total_amount));
  return v_id;
end;
$$;

create or replace function public.payments_update_invoice(
  p_tenant uuid,
  p_invoice uuid,
  p_contact uuid,
  p_title text,
  p_status text,
  p_currency text,
  p_issue_date date,
  p_due_date date,
  p_line_items jsonb,
  p_tax_amount numeric,
  p_discount_amount numeric,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_existing record;
  v_tot record;
  v_next_status text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if length(btrim(coalesce(p_title,''))) not between 1 and 200 then raise exception 'Invalid invoice title'; end if;
  if coalesce(p_status,'') not in ('draft','sent','void') then raise exception 'Invalid invoice status'; end if;
  select * into v_existing from public.invoices i where i.id=p_invoice and i.tenant_id=p_tenant;
  if not found then raise exception 'Invoice not found in this business'; end if;
  if p_contact is not null and not exists (select 1 from public.contacts c where c.id=p_contact and c.tenant_id=p_tenant) then
    raise exception 'Contact not found in this business';
  end if;
  select * into v_tot from public.payments_compute_invoice_totals(coalesce(p_line_items,'[]'::jsonb), coalesce(p_tax_amount,0), coalesce(p_discount_amount,0));
  v_next_status := p_status;
  if v_existing.amount_paid > 0 and v_next_status <> 'void' then
    v_next_status := case when v_existing.amount_paid < v_tot.total_amount then 'partially_paid' else 'paid' end;
  end if;
  update public.invoices set
    contact_id=p_contact, title=btrim(p_title), status=v_next_status, currency=upper(btrim(coalesce(p_currency,'INR'))),
    issue_date=coalesce(p_issue_date,current_date), due_date=p_due_date,
    line_items=coalesce(p_line_items,'[]'::jsonb), subtotal=v_tot.subtotal, tax_amount=v_tot.tax_amount,
    discount_amount=v_tot.discount_amount, total_amount=v_tot.total_amount,
    notes=nullif(btrim(coalesce(p_notes,'')),'')
  where id=p_invoice and tenant_id=p_tenant;
  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'payments.invoice_updated', 'invoice', p_invoice::text, jsonb_build_object('status', v_next_status, 'total', v_tot.total_amount));
end;
$$;

create or replace function public.payments_record_payment(
  p_tenant uuid,
  p_invoice uuid,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_paid_at timestamptz,
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
  v_status text;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'Invalid payment amount'; end if;
  if coalesce(p_method,'') not in ('cash','upi','card','bank_transfer','other') then raise exception 'Invalid payment method'; end if;
  select status into v_status from public.invoices where id=p_invoice and tenant_id=p_tenant;
  if not found then raise exception 'Invoice not found in this business'; end if;
  if v_status = 'void' then raise exception 'Cannot record payment on a void invoice'; end if;
  insert into public.invoice_payments (tenant_id, invoice_id, amount, method, reference, paid_at, notes, created_by)
  values (p_tenant, p_invoice, round(p_amount,2), p_method, nullif(btrim(coalesce(p_reference,'')),''), coalesce(p_paid_at, now()), nullif(btrim(coalesce(p_notes,'')),''), v_caller)
  returning id into v_id;
  perform public.payments_refresh_invoice_status(p_tenant, p_invoice);
  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, v_caller, 'payments.payment_recorded', 'invoice_payment', v_id::text, jsonb_build_object('invoice_id', p_invoice, 'amount', round(p_amount,2), 'method', p_method));
  return v_id;
end;
$$;

create or replace function public.payments_delete_invoice(p_tenant uuid, p_invoice uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_caller uuid := (select auth.uid());
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if not public.has_tenant_access(p_tenant) then raise exception 'No access to this business'; end if;
  if not public.can_manage_sales_agent(p_tenant) then raise exception 'Only an owner or admin can delete an invoice'; end if;
  if not exists (select 1 from public.invoices i where i.id=p_invoice and i.tenant_id=p_tenant) then raise exception 'Invoice not found'; end if;
  delete from public.invoices where id=p_invoice and tenant_id=p_tenant;
  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (p_tenant, v_caller, 'payments.invoice_deleted', 'invoice', p_invoice::text);
end;
$$;

revoke all on function public.payments_compute_invoice_totals(jsonb,numeric,numeric) from public, anon;
grant execute on function public.payments_compute_invoice_totals(jsonb,numeric,numeric) to authenticated;
revoke all on function public.payments_refresh_invoice_status(uuid,uuid) from public, anon;
grant execute on function public.payments_refresh_invoice_status(uuid,uuid) to authenticated;
revoke all on function public.payments_create_invoice(uuid,uuid,text,text,text,date,date,jsonb,numeric,numeric,text) from public, anon;
grant execute on function public.payments_create_invoice(uuid,uuid,text,text,text,date,date,jsonb,numeric,numeric,text) to authenticated;
revoke all on function public.payments_update_invoice(uuid,uuid,uuid,text,text,text,date,date,jsonb,numeric,numeric,text) from public, anon;
grant execute on function public.payments_update_invoice(uuid,uuid,uuid,text,text,text,date,date,jsonb,numeric,numeric,text) to authenticated;
revoke all on function public.payments_record_payment(uuid,uuid,numeric,text,text,timestamptz,text) from public, anon;
grant execute on function public.payments_record_payment(uuid,uuid,numeric,text,text,timestamptz,text) to authenticated;
revoke all on function public.payments_delete_invoice(uuid,uuid) from public, anon;
grant execute on function public.payments_delete_invoice(uuid,uuid) to authenticated;

commit;
