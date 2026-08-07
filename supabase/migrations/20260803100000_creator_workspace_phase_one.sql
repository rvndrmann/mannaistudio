-- Phase-one Studio workspace data. All records remain private to the project owner.
alter table public.creator_entities add column if not exists status text not null default 'draft';
alter table public.creator_episodes add column if not exists script_updated_at timestamptz;

create table if not exists public.creator_script_suggestions (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.creator_episodes(id) on delete cascade,
  content jsonb not null, summary text, status text not null default 'pending' check (status in ('pending','accepted','dismissed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.creator_shot_assets (
  shot_id uuid not null references public.creator_shots(id) on delete cascade,
  entity_id uuid not null references public.creator_entities(id) on delete cascade,
  order_index integer not null default 0,
  primary key (shot_id, entity_id)
);
create index if not exists creator_script_suggestions_episode_idx on public.creator_script_suggestions(episode_id, created_at desc);
create index if not exists creator_shot_assets_shot_idx on public.creator_shot_assets(shot_id, order_index);

alter table public.creator_script_suggestions enable row level security;
alter table public.creator_shot_assets enable row level security;
create policy "creator script suggestions owner" on public.creator_script_suggestions for all using (
  exists (select 1 from public.creator_episodes e join public.creator_projects p on p.id = e.project_id where e.id = episode_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from public.creator_episodes e join public.creator_projects p on p.id = e.project_id where e.id = episode_id and p.user_id = auth.uid())
);
create policy "creator shot assets owner" on public.creator_shot_assets for all using (
  exists (select 1 from public.creator_shots s join public.creator_episodes e on e.id = s.episode_id join public.creator_projects p on p.id = e.project_id where s.id = shot_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from public.creator_shots s join public.creator_episodes e on e.id = s.episode_id join public.creator_projects p on p.id = e.project_id where s.id = shot_id and p.user_id = auth.uid())
);

drop trigger if exists creator_script_suggestions_updated on public.creator_script_suggestions;
create trigger creator_script_suggestions_updated before update on public.creator_script_suggestions for each row execute function public.creator_touch_updated_at();

insert into storage.buckets (id, name, public) values ('creator-studio-media', 'creator-studio-media', false) on conflict (id) do nothing;
create policy "creator studio media owner" on storage.objects for all using (
  bucket_id = 'creator-studio-media' and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'creator-studio-media' and (storage.foldername(name))[1] = auth.uid()::text
);
