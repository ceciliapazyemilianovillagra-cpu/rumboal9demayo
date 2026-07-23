-- Esquema inicial de Rumbo al 9 de Mayo.
create type public.app_role as enum ('admin', 'coordinacion', 'territorio', 'finanzas', 'consulta');

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'consulta',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.voters (
  id bigint generated always as identity primary key,
  dni text not null unique,
  full_name text not null,
  address text,
  circuit text,
  polling_place text,
  contact_status text not null default 'sin_contactar',
  assigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.headquarters (
  id bigint generated always as identity primary key,
  name text not null,
  address text not null,
  circuit text,
  leader_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.budget_entries (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('ingreso', 'gasto', 'compromiso')),
  category text not null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null,
  status text not null default 'confirmado' check (status in ('pendiente', 'confirmado', 'cancelado')),
  payment_method text,
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index voters_assigned_to_idx on public.voters (assigned_to);
create index voters_circuit_idx on public.voters (circuit);
create index headquarters_circuit_idx on public.headquarters (circuit);
create index budget_entries_occurred_on_idx on public.budget_entries (occurred_on desc);
create index budget_entries_kind_idx on public.budget_entries (kind);
create index budget_entries_created_by_idx on public.budget_entries (created_by);
create index audit_log_actor_id_idx on public.audit_log (actor_id);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, 'Usuario'), '@', 1))
  );
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.has_role(allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and active
      and role = any(allowed_roles)
  );
$$;

revoke execute on function private.has_role(public.app_role[]) from public, anon;
grant execute on function private.has_role(public.app_role[]) to authenticated;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function private.touch_updated_at() from public, anon, authenticated;

create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function private.touch_updated_at();
create trigger voters_touch_updated_at before update on public.voters
for each row execute function private.touch_updated_at();
create trigger headquarters_touch_updated_at before update on public.headquarters
for each row execute function private.touch_updated_at();
create trigger budget_entries_touch_updated_at before update on public.budget_entries
for each row execute function private.touch_updated_at();

create or replace function private.audit_budget_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id text;
  payload jsonb;
begin
  row_id := coalesce(new.id, old.id)::text;
  payload := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_log (actor_id, entity_type, entity_id, action, details)
  values ((select auth.uid()), 'budget_entry', row_id, lower(tg_op), payload);
  return coalesce(new, old);
end;
$$;

revoke execute on function private.audit_budget_entry() from public, anon, authenticated;

create trigger audit_budget_entries
after insert or update or delete on public.budget_entries
for each row execute function private.audit_budget_entry();

alter table public.profiles enable row level security;
alter table public.voters enable row level security;
alter table public.headquarters enable row level security;
alter table public.budget_entries enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_select on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (select private.has_role(array['admin', 'coordinacion']::public.app_role[]))
);

create policy voters_select on public.voters for select to authenticated
using ((select private.has_role(array['admin', 'coordinacion', 'territorio', 'consulta']::public.app_role[])));

create policy headquarters_select on public.headquarters for select to authenticated
using ((select private.has_role(array['admin', 'coordinacion', 'territorio', 'finanzas', 'consulta']::public.app_role[])));

create policy budget_select on public.budget_entries for select to authenticated
using ((select private.has_role(array['admin', 'coordinacion', 'finanzas']::public.app_role[])));

create policy budget_insert on public.budget_entries for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.has_role(array['admin', 'coordinacion', 'finanzas']::public.app_role[]))
);

create policy budget_update on public.budget_entries for update to authenticated
using ((select private.has_role(array['admin', 'coordinacion', 'finanzas']::public.app_role[])))
with check ((select private.has_role(array['admin', 'coordinacion', 'finanzas']::public.app_role[])));

create policy budget_delete on public.budget_entries for delete to authenticated
using ((select private.has_role(array['admin', 'coordinacion']::public.app_role[])));

create policy audit_select on public.audit_log for select to authenticated
using ((select private.has_role(array['admin']::public.app_role[])));

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles, public.voters, public.headquarters, public.budget_entries to authenticated;
grant select on public.audit_log to authenticated;
grant insert (kind, category, description, amount, occurred_on, status, payment_method, notes, created_by) on public.budget_entries to authenticated;
grant update (kind, category, description, amount, occurred_on, status, payment_method, notes) on public.budget_entries to authenticated;
grant delete on public.budget_entries to authenticated;
grant usage, select on all sequences in schema public to authenticated;
