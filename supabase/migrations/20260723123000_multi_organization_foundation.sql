-- Fundacion multi-organizacion para comercializar la plataforma a distintos espacios.
alter table public.profiles
  add column if not exists is_platform_admin boolean not null default false;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  candidate_name text not null,
  position_sought text,
  slug text not null unique,
  primary_color text not null default '#2d2d49',
  accent_color text not null default '#ffad4d',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  role public.app_role not null default 'consulta',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

alter table public.headquarters
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists team_id uuid references public.teams(id) on delete set null,
  add column if not exists responsible_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists phone text,
  add column if not exists notes text;

alter table public.budget_entries
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.voters
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists source_data jsonb not null default '{}'::jsonb;

alter table public.voters drop constraint if exists voters_dni_key;
create unique index if not exists voters_organization_dni_idx
  on public.voters (organization_id, dni);
create index if not exists memberships_user_idx on public.memberships (user_id);
create index if not exists memberships_team_idx on public.memberships (team_id);
create index if not exists teams_organization_idx on public.teams (organization_id);
create index if not exists headquarters_organization_idx on public.headquarters (organization_id);
create index if not exists headquarters_team_idx on public.headquarters (team_id);
create index if not exists budget_entries_organization_date_idx
  on public.budget_entries (organization_id, occurred_on desc);
create index if not exists voters_organization_circuit_idx
  on public.voters (organization_id, circuit);

create trigger organizations_touch_updated_at before update on public.organizations
for each row execute function private.touch_updated_at();
create trigger teams_touch_updated_at before update on public.teams
for each row execute function private.touch_updated_at();
create trigger memberships_touch_updated_at before update on public.memberships
for each row execute function private.touch_updated_at();

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.active and p.is_platform_admin
    from public.profiles p
    where p.id = (select auth.uid())
  ), false);
$$;

create or replace function private.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_platform_admin()) or exists (
    select 1
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.organization_id = target_organization_id
      and m.user_id = (select auth.uid())
      and m.active
      and p.active
  );
$$;

create or replace function private.has_org_role(
  target_organization_id uuid,
  allowed_roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_platform_admin()) or exists (
    select 1
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.organization_id = target_organization_id
      and m.user_id = (select auth.uid())
      and m.active
      and p.active
      and m.role = any(allowed_roles)
  );
$$;

create or replace function private.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id = (select auth.uid())
    or (select private.is_platform_admin())
    or exists (
      select 1
      from public.memberships mine
      join public.memberships theirs
        on theirs.organization_id = mine.organization_id
      where mine.user_id = (select auth.uid())
        and mine.active
        and theirs.user_id = target_user_id
        and theirs.active
    );
$$;

revoke execute on function private.is_platform_admin() from public, anon;
revoke execute on function private.is_org_member(uuid) from public, anon;
revoke execute on function private.has_org_role(uuid, public.app_role[]) from public, anon;
revoke execute on function private.can_view_profile(uuid) from public, anon;
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, public.app_role[]) to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.teams enable row level security;
alter table public.memberships enable row level security;

drop policy if exists profiles_select on public.profiles;
drop policy if exists voters_select on public.voters;
drop policy if exists headquarters_select on public.headquarters;
drop policy if exists budget_select on public.budget_entries;
drop policy if exists budget_insert on public.budget_entries;
drop policy if exists budget_update on public.budget_entries;
drop policy if exists budget_delete on public.budget_entries;

create policy profiles_select on public.profiles for select to authenticated
using ((select private.can_view_profile(id)));

create policy organizations_select on public.organizations for select to authenticated
using ((select private.is_org_member(id)));
create policy organizations_insert on public.organizations for insert to authenticated
with check ((select private.is_platform_admin()));
create policy organizations_update on public.organizations for update to authenticated
using (
  (select private.is_platform_admin())
  or (select private.has_org_role(id, array['admin']::public.app_role[]))
)
with check (
  (select private.is_platform_admin())
  or (select private.has_org_role(id, array['admin']::public.app_role[]))
);

create policy teams_select on public.teams for select to authenticated
using ((select private.is_org_member(organization_id)));
create policy teams_insert on public.teams for insert to authenticated
with check ((select private.has_org_role(organization_id, array['admin', 'coordinacion']::public.app_role[])));
create policy teams_update on public.teams for update to authenticated
using ((select private.has_org_role(organization_id, array['admin', 'coordinacion']::public.app_role[])))
with check ((select private.has_org_role(organization_id, array['admin', 'coordinacion']::public.app_role[])));
create policy teams_delete on public.teams for delete to authenticated
using ((select private.has_org_role(organization_id, array['admin']::public.app_role[])));

create policy memberships_select on public.memberships for select to authenticated
using ((select private.is_org_member(organization_id)));
create policy memberships_insert on public.memberships for insert to authenticated
with check ((select private.has_org_role(organization_id, array['admin']::public.app_role[])));
create policy memberships_update on public.memberships for update to authenticated
using ((select private.has_org_role(organization_id, array['admin']::public.app_role[])))
with check ((select private.has_org_role(organization_id, array['admin']::public.app_role[])));
create policy memberships_delete on public.memberships for delete to authenticated
using ((select private.has_org_role(organization_id, array['admin']::public.app_role[])));

create policy voters_select on public.voters for select to authenticated
using ((select private.is_org_member(organization_id)));
create policy voters_insert on public.voters for insert to authenticated
with check ((select private.has_org_role(organization_id, array['admin', 'coordinacion', 'territorio']::public.app_role[])));
create policy voters_update on public.voters for update to authenticated
using ((select private.has_org_role(organization_id, array['admin', 'coordinacion', 'territorio']::public.app_role[])))
with check ((select private.has_org_role(organization_id, array['admin', 'coordinacion', 'territorio']::public.app_role[])));

create policy headquarters_select on public.headquarters for select to authenticated
using ((select private.is_org_member(organization_id)));
create policy headquarters_insert on public.headquarters for insert to authenticated
with check ((select private.has_org_role(organization_id, array['admin', 'coordinacion', 'territorio']::public.app_role[])));
create policy headquarters_update on public.headquarters for update to authenticated
using ((select private.has_org_role(organization_id, array['admin', 'coordinacion', 'territorio']::public.app_role[])))
with check ((select private.has_org_role(organization_id, array['admin', 'coordinacion', 'territorio']::public.app_role[])));
create policy headquarters_delete on public.headquarters for delete to authenticated
using ((select private.has_org_role(organization_id, array['admin', 'coordinacion']::public.app_role[])));

create policy budget_select on public.budget_entries for select to authenticated
using ((select private.has_org_role(organization_id, array['admin', 'coordinacion', 'finanzas']::public.app_role[])));
create policy budget_insert on public.budget_entries for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.has_org_role(organization_id, array['admin', 'coordinacion', 'finanzas']::public.app_role[]))
);
create policy budget_update on public.budget_entries for update to authenticated
using ((select private.has_org_role(organization_id, array['admin', 'coordinacion', 'finanzas']::public.app_role[])))
with check ((select private.has_org_role(organization_id, array['admin', 'coordinacion', 'finanzas']::public.app_role[])));
create policy budget_delete on public.budget_entries for delete to authenticated
using ((select private.has_org_role(organization_id, array['admin', 'coordinacion']::public.app_role[])));

revoke all on public.organizations, public.teams, public.memberships from anon, authenticated;
grant select on public.organizations, public.teams, public.memberships to authenticated;
grant insert, update on public.organizations to authenticated;
grant insert, update, delete on public.teams, public.memberships to authenticated;
grant insert, update on public.headquarters, public.voters to authenticated;
grant delete on public.headquarters to authenticated;
grant insert (organization_id, kind, category, description, amount, occurred_on, status, payment_method, notes, created_by)
  on public.budget_entries to authenticated;
