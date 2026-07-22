-- Esquema inicial para aplicar cuando exista un proyecto Supabase conectado.
create type public.app_role as enum ('admin', 'coordinacion', 'territorio', 'finanzas', 'consulta');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'consulta',
  active boolean not null default true,
  created_at timestamptz not null default now()
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
  created_at timestamptz not null default now()
);

create table public.budget_entries (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('ingreso','gasto','compromiso')),
  category text not null,
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  occurred_on date not null,
  status text not null default 'pendiente',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
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

alter table public.profiles enable row level security;
alter table public.voters enable row level security;
alter table public.headquarters enable row level security;
alter table public.budget_entries enable row level security;
alter table public.audit_log enable row level security;

create policy "usuarios leen su perfil" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "usuarios activos leen votantes" on public.voters for select to authenticated using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active));
create policy "usuarios activos leen sedes" on public.headquarters for select to authenticated using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active));
create policy "finanzas leen presupuesto" on public.budget_entries for select to authenticated using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active and p.role in ('admin','coordinacion','finanzas')));
create policy "admin lee auditoria" on public.audit_log for select to authenticated using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active and p.role = 'admin'));
