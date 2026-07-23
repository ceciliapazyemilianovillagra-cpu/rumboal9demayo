drop policy if exists targets_write on public.operational_targets;
create policy targets_insert on public.operational_targets for insert to authenticated
with check (created_by=(select auth.uid()) and (select private.has_org_role(organization_id,array['admin','coordinacion']::public.app_role[])));
create policy targets_update on public.operational_targets for update to authenticated
using ((select private.has_org_role(organization_id,array['admin','coordinacion']::public.app_role[])))
with check ((select private.has_org_role(organization_id,array['admin','coordinacion']::public.app_role[])));
create policy targets_delete on public.operational_targets for delete to authenticated
using ((select private.has_org_role(organization_id,array['admin','coordinacion']::public.app_role[])));

create index if not exists activities_created_by_idx on public.activities(created_by);
create index if not exists activities_headquarters_idx on public.activities(headquarters_id);
create index if not exists activities_responsible_idx on public.activities(responsible_user_id);
create index if not exists activities_team_idx on public.activities(team_id);
create index if not exists claims_created_by_idx on public.claims(created_by);
create index if not exists claims_headquarters_idx on public.claims(headquarters_id);
create index if not exists claims_responsible_idx on public.claims(responsible_user_id);
create index if not exists claims_team_idx on public.claims(team_id);
create index if not exists projects_created_by_idx on public.projects(created_by);
create index if not exists projects_responsible_idx on public.projects(responsible_user_id);
create index if not exists projects_source_claim_idx on public.projects(source_claim_id);
create index if not exists projects_team_idx on public.projects(team_id);
create index if not exists proposals_created_by_idx on public.proposals(created_by);
create index if not exists proposals_project_idx on public.proposals(project_id);
create index if not exists proposals_responsible_idx on public.proposals(responsible_user_id);
create index if not exists proposals_source_claim_idx on public.proposals(source_claim_id);
create index if not exists referents_created_by_idx on public.territorial_referents(created_by);
create index if not exists referents_headquarters_idx on public.territorial_referents(headquarters_id);
create index if not exists referents_reports_to_idx on public.territorial_referents(reports_to_user_id);
create index if not exists referents_team_idx on public.territorial_referents(team_id);
create index if not exists attachments_org_entity_idx on public.entity_attachments(organization_id,entity_type,entity_id);
create index if not exists attachments_uploaded_by_idx on public.entity_attachments(uploaded_by);
create index if not exists voter_imports_created_by_idx on public.voter_imports(created_by);
create index if not exists targets_created_by_idx on public.operational_targets(created_by);
create index if not exists headquarters_responsible_idx on public.headquarters(responsible_user_id);
