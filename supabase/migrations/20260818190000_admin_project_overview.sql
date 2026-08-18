-- Who made what, and what it cost.
--
-- The admin panel could see students, billing, and orders, but not the thing
-- the credits are actually spent on. This reports every production with its
-- owner and its credit spend, and lets an admin open one when they need to
-- look inside it.

create or replace function public.admin_project_overview()
returns table (
  project_id uuid,
  project_name text,
  owner_id uuid,
  owner_name text,
  owner_email text,
  created_at timestamptz,
  updated_at timestamptz,
  episodes integer,
  shots integer,
  entities integer,
  jobs integer,
  credits_used integer,
  credits_refunded integer,
  last_activity timestamptz,
  admin_has_access boolean
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.user_id,
    coalesce(pr.full_name, ''),
    coalesce(pr.email, ''),
    p.created_at,
    p.updated_at,
    (select count(*)::int from public.creator_episodes e where e.project_id = p.id),
    (select count(*)::int from public.creator_shots s
       join public.creator_episodes e on e.id = s.episode_id
      where e.project_id = p.id),
    (select count(*)::int from public.creator_entities en where en.project_id = p.id),
    (select count(*)::int from public.creator_generation_jobs j where j.project_id = p.id),
    -- Net of refunds, because a failed generation that was refunded did not
    -- cost the user anything and should not read as spend.
    (select coalesce(sum(greatest(coalesce(j.credits_used, 0) - coalesce(j.credits_refunded, 0), 0)), 0)::int from public.creator_generation_jobs j where j.project_id = p.id),
    (select coalesce(sum(coalesce(j.credits_refunded, 0)), 0)::int from public.creator_generation_jobs j where j.project_id = p.id),
    (select max(j.created_at) from public.creator_generation_jobs j where j.project_id = p.id),
    exists (
      select 1 from public.creator_project_members m
      where m.project_id = p.id and m.profile_id = auth.uid()
    ) or p.user_id = auth.uid()
  from public.creator_projects p
  left join public.profiles pr on pr.id = p.user_id
  where exists (select 1 from public.admin_users a where a.id = auth.uid())
  order by p.created_at desc;
$$;

grant execute on function public.admin_project_overview() to authenticated;

-- Opening someone else's production.
--
-- Access is granted through the same creator_project_members row that team
-- sharing and enterprise orders use, rather than a second, invisible admin
-- bypass in every policy. That means the owner can see the admin listed on
-- their project, and revoking works the same way it always did.
create or replace function public.admin_grant_project_access(p_project_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception 'Only admins can open another user''s project';
  end if;

  select user_id into v_owner from public.creator_projects where id = p_project_id;
  if v_owner is null then raise exception 'Project not found'; end if;
  -- An owner needs no grant, and adding one would list them as a member of
  -- their own project.
  if v_owner = auth.uid() then return true; end if;

  insert into public.creator_project_members (project_id, profile_id, added_by)
  values (p_project_id, auth.uid(), auth.uid())
  on conflict (project_id, profile_id) do nothing;

  return true;
end;
$$;

create or replace function public.admin_revoke_project_access(p_project_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception 'Only admins can do this';
  end if;
  delete from public.creator_project_members
  where project_id = p_project_id and profile_id = auth.uid();
  return true;
end;
$$;

grant execute on function public.admin_grant_project_access(uuid) to authenticated;
grant execute on function public.admin_revoke_project_access(uuid) to authenticated;
