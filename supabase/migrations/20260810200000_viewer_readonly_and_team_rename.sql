-- Two follow-ups to teams and project sharing:
--
-- 1. Viewers are read-only. Sharing previously granted full edit rights to every
--    member regardless of their team role.
-- 2. Owners and admins can rename a team.
--
-- Read and write are separated by pairing a SELECT policy that uses
-- can_access_creator_project with an ALL policy that uses
-- can_edit_creator_project. Permissive policies are OR'd, so a viewer passes the
-- SELECT policy and fails the ALL policy: they can read but not write. Editors
-- pass both.

create or replace function public.can_edit_creator_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.creator_projects p
    where p.id = p_project_id and p.user_id = auth.uid()
  ) or exists (
    select 1
    from public.creator_project_members m
    join public.team_members tm on tm.profile_id = m.profile_id
    where m.project_id = p_project_id
      and m.profile_id = auth.uid()
      and tm.role <> 'viewer'
  );
$$;

grant execute on function public.can_edit_creator_project(uuid) to authenticated;

-- The project row itself: everyone with access may read, editors may update,
-- and only the owner may delete or insert.
drop policy if exists "creator projects owner" on public.creator_projects;
drop policy if exists "creator projects read" on public.creator_projects;
drop policy if exists "creator projects insert" on public.creator_projects;
drop policy if exists "creator projects update" on public.creator_projects;
drop policy if exists "creator projects delete" on public.creator_projects;

create policy "creator projects read" on public.creator_projects for select
  using (public.can_access_creator_project(id));
create policy "creator projects insert" on public.creator_projects for insert
  with check (auth.uid() = user_id);
create policy "creator projects update" on public.creator_projects for update
  using (public.can_edit_creator_project(id))
  with check (public.can_edit_creator_project(id));
create policy "creator projects delete" on public.creator_projects for delete
  using (auth.uid() = user_id);

do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('creator_episodes',            'creator episodes owner',            'public.can_%s_creator_project(project_id)'),
      ('creator_entities',            'creator entities owner',            'public.can_%s_creator_project(project_id)'),
      ('creator_brand_profiles',      'creator brand profiles owner',      'public.can_%s_creator_project(project_id)'),
      ('creator_project_memory',      'creator project memory owner',      'public.can_%s_creator_project(project_id)'),
      ('creator_reference_assets',    'creator reference assets owner',    'public.can_%s_creator_project(project_id)'),
      ('creator_series',              'creator series owner',              'public.can_%s_creator_project(project_id)'),
      ('creator_continuity_facts',    'creator continuity facts owner',    'public.can_%s_creator_project(project_id)'),
      ('creator_continuity_issues',   'creator continuity issues owner',   'public.can_%s_creator_project(project_id)'),
      ('creator_seasons',             'creator seasons owner',             'exists (select 1 from public.creator_series s where s.id = series_id and public.can_%s_creator_project(s.project_id))'),
      ('creator_scenes',              'creator scenes owner',              'exists (select 1 from public.creator_episodes e where e.id = episode_id and public.can_%s_creator_project(e.project_id))'),
      ('creator_shots',               'creator shots owner',               'exists (select 1 from public.creator_episodes e where e.id = episode_id and public.can_%s_creator_project(e.project_id))'),
      ('creator_script_suggestions',  'creator script suggestions owner',  'exists (select 1 from public.creator_episodes e where e.id = episode_id and public.can_%s_creator_project(e.project_id))'),
      ('creator_shot_assets',         'creator shot assets owner',         'exists (select 1 from public.creator_shots s join public.creator_episodes e on e.id = s.episode_id where s.id = shot_id and public.can_%s_creator_project(e.project_id))')
    ) as t(table_name, policy_name, predicate)
  loop
    execute format('drop policy if exists %I on public.%I', spec.policy_name, spec.table_name);
    execute format('drop policy if exists %I on public.%I', spec.policy_name || ' read', spec.table_name);

    execute format(
      'create policy %I on public.%I for select using (%s)',
      spec.policy_name || ' read', spec.table_name, format(spec.predicate, 'access')
    );
    execute format(
      'create policy %I on public.%I for all using (%s) with check (%s)',
      spec.policy_name, spec.table_name,
      format(spec.predicate, 'edit'), format(spec.predicate, 'edit')
    );
  end loop;
end;
$$;

-- Revisions stay per-user and require edit rights to raise.
drop policy if exists "creator revisions owner" on public.creator_revision_requests;
drop policy if exists "creator revisions read" on public.creator_revision_requests;
create policy "creator revisions read" on public.creator_revision_requests for select
  using (user_id = auth.uid() and public.can_access_creator_project(project_id));
create policy "creator revisions owner" on public.creator_revision_requests for all
  using (user_id = auth.uid() and public.can_edit_creator_project(project_id))
  with check (user_id = auth.uid() and public.can_edit_creator_project(project_id));

-- Sharing a project with a viewer should still be possible; the role decides
-- what they can do once inside.
create or replace function public.rename_team(p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  caller_role text;
  caller_team uuid;
  trimmed text := nullif(btrim(p_name), '');
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if trimmed is null then raise exception 'Team name is required'; end if;

  select team_id, role into caller_team, caller_role from public.team_members where profile_id = auth.uid();
  if caller_team is null then raise exception 'You do not belong to a team'; end if;
  if caller_role not in ('owner', 'admin') then raise exception 'Only the team owner or an admin can rename the team'; end if;

  update public.teams set name = trimmed where id = caller_team;
end;
$$;

grant execute on function public.rename_team(text) to authenticated;
