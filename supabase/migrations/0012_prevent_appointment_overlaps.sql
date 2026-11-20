-- Hotfix: make double-booking impossible at the database level.
--
-- The booking RPCs revalidate the chosen slot under a transaction-scoped
-- advisory lock, but that lock key includes the selected resource. A request
-- with an explicit resource and one that lets the server auto-assign a resource
-- therefore take different locks and can race. A GiST exclusion constraint is
-- the authoritative guard for every path (including cross-day spillover and
-- direct writes). Cancelled/no-show appointments are excluded, so history is
-- preserved and their slot remains bookable.
--
-- This is folded into 0010 for fresh installs. Apply this file on databases
-- that already ran 0010. Safe to re-run.
--
begin;

create extension if not exists btree_gist with schema extensions;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'appointments_no_overlap'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_no_overlap
      exclude using gist (
        tenant_id with =,
        resource_id with =,
        tstzrange(start_at, end_at, '[)') with &&
      )
      where (resource_id is not null and status not in ('cancelled', 'no_show'));
  end if;
end $$;

commit;
