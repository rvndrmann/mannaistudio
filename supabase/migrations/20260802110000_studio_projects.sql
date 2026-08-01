-- Creator Studio: a lightweight project / episode / shot workspace.
create extension if not exists pgcrypto;

create table if not exists public.studio_projects (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    title text not null check (char_length(trim(title)) > 0),
    description text not null default '',
    visual_style text not null default 'Cinematic',
    aspect_ratio text not null default '16:9',
    cover_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.studio_episodes (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.studio_projects(id) on delete cascade,
    title text not null check (char_length(trim(title)) > 0),
    script text not null default '',
    position integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.studio_shots (
    id uuid primary key default gen_random_uuid(),
    episode_id uuid not null references public.studio_episodes(id) on delete cascade,
    title text not null check (char_length(trim(title)) > 0),
    prompt text not null default '',
    duration_seconds integer not null default 5 check (duration_seconds between 1 and 120),
    position integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists studio_projects_profile_created_idx on public.studio_projects(profile_id, created_at desc);
create index if not exists studio_episodes_project_position_idx on public.studio_episodes(project_id, position);
create index if not exists studio_shots_episode_position_idx on public.studio_shots(episode_id, position);

create or replace function public.studio_touch_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists studio_projects_touch_updated_at on public.studio_projects;
create trigger studio_projects_touch_updated_at before update on public.studio_projects for each row execute function public.studio_touch_updated_at();
drop trigger if exists studio_episodes_touch_updated_at on public.studio_episodes;
create trigger studio_episodes_touch_updated_at before update on public.studio_episodes for each row execute function public.studio_touch_updated_at();
drop trigger if exists studio_shots_touch_updated_at on public.studio_shots;
create trigger studio_shots_touch_updated_at before update on public.studio_shots for each row execute function public.studio_touch_updated_at();

alter table public.studio_projects enable row level security;
alter table public.studio_episodes enable row level security;
alter table public.studio_shots enable row level security;

create policy "creators manage their studio projects" on public.studio_projects
for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "creators manage their studio episodes" on public.studio_episodes
for all using (exists (select 1 from public.studio_projects p where p.id = project_id and p.profile_id = auth.uid()))
with check (exists (select 1 from public.studio_projects p where p.id = project_id and p.profile_id = auth.uid()));

create policy "creators manage their studio shots" on public.studio_shots
for all using (exists (
    select 1 from public.studio_episodes e join public.studio_projects p on p.id = e.project_id
    where e.id = episode_id and p.profile_id = auth.uid()
)) with check (exists (
    select 1 from public.studio_episodes e join public.studio_projects p on p.id = e.project_id
    where e.id = episode_id and p.profile_id = auth.uid()
));
