-- Share a project with team members so they can work on it individually.
--
-- The owner picks which projects a member may open. Access is granted per
-- project, never for the whole team, so an owner can keep private work private.
--
-- Only project *content* becomes shared. Per-user tables (chat sessions, tool
-- executions, generation jobs, workflow runs) stay scoped to their own user, so
-- each member gets their own Director conversation and job history on a shared
-- project and spends their own allocated credits.

create table if not exists public.creator_project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, profile_id)
);

create index if not exists creator_project_members_profile_idx on public.creator_project_members (profile_id);
create index if not exists creator_project_members_project_idx on public.creator_project_members (project_id);

alter table public.creator_project_members enable row level security;

-- SECURITY DEFINER so policies can consult it without recursing through the
-- RLS of the tables being filtered.
create or replace function public.can_access_creator_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.creator_projects p
    where p.id = p_project_id and p.user_id = auth.uid()
  ) or exists (
    select 1 from public.creator_project_members m
    where m.project_id = p_project_id and m.profile_id = auth.uid()
  );
$$;

create or replace function public.owns_creator_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.creator_projects p
    where p.id = p_project_id and p.user_id = auth.uid()
  );
$$;

grant execute on function public.can_access_creator_project(uuid) to authenticated;
grant execute on function public.owns_creator_project(uuid) to authenticated;

drop policy if exists "creator project members read" on public.creator_project_members;
create policy "creator project members read"
  on public.creator_project_members for select
  to authenticated
  using (profile_id = auth.uid() or public.owns_creator_project(project_id));

-- Sharing is managed through share_project_with_member / unshare_project below.

-- The owner keeps full control; shared members may read and update the project
-- row but never delete it or change ownership.
drop policy if exists "creator projects owner" on public.creator_projects;
create policy "creator projects owner"
  on public.creator_projects for all
  using (auth.uid() = user_id or public.can_access_creator_project(id))
  with check (auth.uid() = user_id or public.can_access_creator_project(id));

drop policy if exists "creator episodes owner" on public.creator_episodes;
create policy "creator episodes owner" on public.creator_episodes for all
  using (public.can_access_creator_project(project_id))
  with check (public.can_access_creator_project(project_id));

drop policy if exists "creator entities owner" on public.creator_entities;
create policy "creator entities owner" on public.creator_entities for all
  using (public.can_access_creator_project(project_id))
  with check (public.can_access_creator_project(project_id));

drop policy if exists "creator brand profiles owner" on public.creator_brand_profiles;
create policy "creator brand profiles owner" on public.creator_brand_profiles for all
  using (public.can_access_creator_project(project_id))
  with check (public.can_access_creator_project(project_id));

drop policy if exists "creator project memory owner" on public.creator_project_memory;
create policy "creator project memory owner" on public.creator_project_memory for all
  using (public.can_access_creator_project(project_id))
  with check (public.can_access_creator_project(project_id));

drop policy if exists "creator reference assets owner" on public.creator_reference_assets;
create policy "creator reference assets owner" on public.creator_reference_assets for all
  using (public.can_access_creator_project(project_id))
  with check (public.can_access_creator_project(project_id));

drop policy if exists "creator series owner" on public.creator_series;
create policy "creator series owner" on public.creator_series for all
  using (public.can_access_creator_project(project_id))
  with check (public.can_access_creator_project(project_id));

drop policy if exists "creator continuity facts owner" on public.creator_continuity_facts;
create policy "creator continuity facts owner" on public.creator_continuity_facts for all
  using (public.can_access_creator_project(project_id))
  with check (public.can_access_creator_project(project_id));

drop policy if exists "creator continuity issues owner" on public.creator_continuity_issues;
create policy "creator continuity issues owner" on public.creator_continuity_issues for all
  using (public.can_access_creator_project(project_id))
  with check (public.can_access_creator_project(project_id));

drop policy if exists "creator seasons owner" on public.creator_seasons;
create policy "creator seasons owner" on public.creator_seasons for all
  using (exists (select 1 from public.creator_series s where s.id = series_id and public.can_access_creator_project(s.project_id)))
  with check (exists (select 1 from public.creator_series s where s.id = series_id and public.can_access_creator_project(s.project_id)));

drop policy if exists "creator scenes owner" on public.creator_scenes;
create policy "creator scenes owner" on public.creator_scenes for all
  using (exists (select 1 from public.creator_episodes e where e.id = episode_id and public.can_access_creator_project(e.project_id)))
  with check (exists (select 1 from public.creator_episodes e where e.id = episode_id and public.can_access_creator_project(e.project_id)));

drop policy if exists "creator shots owner" on public.creator_shots;
create policy "creator shots owner" on public.creator_shots for all
  using (exists (select 1 from public.creator_episodes e where e.id = episode_id and public.can_access_creator_project(e.project_id)))
  with check (exists (select 1 from public.creator_episodes e where e.id = episode_id and public.can_access_creator_project(e.project_id)));

drop policy if exists "creator script suggestions owner" on public.creator_script_suggestions;
create policy "creator script suggestions owner" on public.creator_script_suggestions for all
  using (exists (select 1 from public.creator_episodes e where e.id = episode_id and public.can_access_creator_project(e.project_id)))
  with check (exists (select 1 from public.creator_episodes e where e.id = episode_id and public.can_access_creator_project(e.project_id)));

drop policy if exists "creator shot assets owner" on public.creator_shot_assets;
create policy "creator shot assets owner" on public.creator_shot_assets for all
  using (exists (select 1 from public.creator_shots s join public.creator_episodes e on e.id = s.episode_id where s.id = shot_id and public.can_access_creator_project(e.project_id)))
  with check (exists (select 1 from public.creator_shots s join public.creator_episodes e on e.id = s.episode_id where s.id = shot_id and public.can_access_creator_project(e.project_id)));

-- Revisions stay per-user but may now be raised on any accessible project.
drop policy if exists "creator revisions owner" on public.creator_revision_requests;
create policy "creator revisions owner" on public.creator_revision_requests for all
  using (user_id = auth.uid() and public.can_access_creator_project(project_id))
  with check (user_id = auth.uid() and public.can_access_creator_project(project_id));

-- Share management. Only the project owner may grant or revoke access, and only
-- to accounts that are already on the owner's team.
create or replace function public.share_project_with_member(p_project_id uuid, p_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  owner_team uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.owns_creator_project(p_project_id) then
    raise exception 'Only the project owner can share this project';
  end if;
  if p_profile_id = auth.uid() then raise exception 'You already own this project'; end if;

  select team_id into owner_team from public.team_members where profile_id = auth.uid();
  if owner_team is null then raise exception 'Create a team before sharing projects'; end if;
  if not exists (select 1 from public.team_members where profile_id = p_profile_id and team_id = owner_team) then
    raise exception 'That account is not on your team';
  end if;

  insert into public.creator_project_members (project_id, profile_id, added_by)
  values (p_project_id, p_profile_id, auth.uid())
  on conflict (project_id, profile_id) do nothing;
end;
$$;

create or replace function public.unshare_project(p_project_id uuid, p_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  -- The owner may revoke anyone; a member may remove their own access.
  if not public.owns_creator_project(p_project_id) and p_profile_id <> auth.uid() then
    raise exception 'Only the project owner can remove access';
  end if;
  delete from public.creator_project_members where project_id = p_project_id and profile_id = p_profile_id;
end;
$$;

-- Projects the caller can open: their own plus everything shared with them.
create or replace function public.accessible_projects()
returns table (project_id uuid, owner_id uuid, owner_name text, owner_email text, shared boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  return query
    select p.id, p.user_id, prof.full_name, prof.email, (p.user_id <> auth.uid())
    from public.creator_projects p
    join public.profiles prof on prof.id = p.user_id
    where p.user_id = auth.uid()
       or exists (select 1 from public.creator_project_members m where m.project_id = p.id and m.profile_id = auth.uid());
end;
$$;

-- Who a given project is shared with.
create or replace function public.project_share_list(p_project_id uuid)
returns table (profile_id uuid, full_name text, email text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.can_access_creator_project(p_project_id) then raise exception 'Project not found'; end if;
  return query
    select p.id, p.full_name, p.email, m.created_at
    from public.creator_project_members m
    join public.profiles p on p.id = m.profile_id
    where m.project_id = p_project_id
    order by m.created_at;
end;
$$;

grant execute on function public.share_project_with_member(uuid, uuid) to authenticated;
grant execute on function public.unshare_project(uuid, uuid) to authenticated;
grant execute on function public.accessible_projects() to authenticated;
grant execute on function public.project_share_list(uuid) to authenticated;
