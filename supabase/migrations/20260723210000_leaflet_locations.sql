alter table public.headquarters
  add column if not exists latitude numeric(10,7),
  add column if not exists longitude numeric(10,7);

alter table public.territorial_referents
  add column if not exists latitude numeric(10,7),
  add column if not exists longitude numeric(10,7);

create index if not exists headquarters_org_coordinates_idx
  on public.headquarters(organization_id,latitude,longitude)
  where latitude is not null and longitude is not null;
create index if not exists claims_org_coordinates_idx
  on public.claims(organization_id,latitude,longitude)
  where latitude is not null and longitude is not null;
create index if not exists referents_org_coordinates_idx
  on public.territorial_referents(organization_id,latitude,longitude)
  where latitude is not null and longitude is not null;
