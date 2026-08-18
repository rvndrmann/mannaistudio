-- Progress through a production, paid once.
--
-- Reaching a pipeline stage earns XP, and the Director reports it under every
-- reply. The award has to be idempotent: the stage is recomputed on every turn,
-- so without a record of what has already been paid a user would earn the same
-- stage again on each message.

create table if not exists public.creator_episode_stage_awards (
  episode_id uuid not null references public.creator_episodes(id) on delete cascade,
  stage_key text not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  xp integer not null default 0,
  awarded_at timestamptz not null default now(),
  primary key (episode_id, stage_key)
);

create index if not exists creator_episode_stage_awards_profile_idx
  on public.creator_episode_stage_awards (profile_id, awarded_at desc);

alter table public.creator_episode_stage_awards enable row level security;

drop policy if exists "episode stage awards read" on public.creator_episode_stage_awards;
create policy "episode stage awards read" on public.creator_episode_stage_awards for select
  to authenticated
  using (exists (
    select 1 from public.creator_episodes e
    where e.id = episode_id and public.can_access_creator_project(e.project_id)
  ));

-- Awards are written only by the function below, never straight from a client:
-- a table a browser can insert into is a table where XP is whatever the user
-- says it is.
create or replace function public.award_episode_stage_xp(p_episode_id uuid, p_stage_key text, p_xp integer)
returns table (awarded integer, total_xp integer, level integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
  v_xp integer := greatest(coalesce(p_xp, 0), 0);
  v_inserted boolean := false;
  v_total integer;
  v_level integer := 1;
  v_remaining integer;
  v_step integer := 500;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select e.project_id into v_project from public.creator_episodes e where e.id = p_episode_id;
  if v_project is null then raise exception 'Episode not found'; end if;
  if not public.can_edit_creator_project(v_project) then
    raise exception 'You do not have permission to change this project';
  end if;

  insert into public.creator_episode_stage_awards (episode_id, stage_key, profile_id, xp)
  values (p_episode_id, left(p_stage_key, 60), auth.uid(), v_xp)
  on conflict (episode_id, stage_key) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted then
    update public.profiles set xp = coalesce(xp, 0) + v_xp where id = auth.uid()
    returning xp into v_total;
  else
    select coalesce(xp, 0) into v_total from public.profiles where id = auth.uid();
    v_xp := 0;
  end if;

  -- The same widening curve the workspace shows, kept here so the stored level
  -- and the displayed one cannot drift apart.
  v_remaining := coalesce(v_total, 0);
  while v_remaining >= v_step loop
    v_remaining := v_remaining - v_step;
    v_level := v_level + 1;
    v_step := round(v_step * 1.35);
  end loop;

  update public.profiles set level = v_level where id = auth.uid();

  return query select v_xp, coalesce(v_total, 0), v_level;
end;
$$;

grant execute on function public.award_episode_stage_xp(uuid, text, integer) to authenticated;
