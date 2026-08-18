-- The overview labels credits_used as net spend, so refunded credits must not
-- remain in that total. The separate credits_refunded column remains available
-- for support and reconciliation.
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
    (select count(*)::int from public.creator_shots s join public.creator_episodes e on e.id = s.episode_id where e.project_id = p.id),
    (select count(*)::int from public.creator_entities en where en.project_id = p.id),
    (select count(*)::int from public.creator_generation_jobs j where j.project_id = p.id),
    (select coalesce(sum(greatest(coalesce(j.credits_used, 0) - coalesce(j.credits_refunded, 0), 0)), 0)::int from public.creator_generation_jobs j where j.project_id = p.id),
    (select coalesce(sum(coalesce(j.credits_refunded, 0)), 0)::int from public.creator_generation_jobs j where j.project_id = p.id),
    (select max(j.created_at) from public.creator_generation_jobs j where j.project_id = p.id),
    exists (select 1 from public.creator_project_members m where m.project_id = p.id and m.profile_id = auth.uid()) or p.user_id = auth.uid()
  from public.creator_projects p
  left join public.profiles pr on pr.id = p.user_id
  where exists (select 1 from public.admin_users a where a.id = auth.uid())
  order by p.created_at desc;
$$;

grant execute on function public.admin_project_overview() to authenticated;
