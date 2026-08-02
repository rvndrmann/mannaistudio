-- Full creator workspace data model, namespaced to coexist with AI Director Hub.
create extension if not exists pgcrypto;

create type public.creator_entity_type as enum ('character', 'scene', 'prop');
create type public.creator_video_status as enum ('none', 'generating', 'completed', 'failed', 'cancelled');
create type public.creator_episode_status as enum ('draft', 'in_progress', 'completed');
create type public.creator_message_role as enum ('user', 'assistant', 'system', 'tool');
create type public.creator_job_type as enum ('image', 'video');
create type public.creator_job_status as enum ('queued', 'awaiting_approval', 'approved', 'processing', 'completed', 'failed', 'cancelled');
create type public.creator_chat_mode as enum ('manual', 'smart_auto');

create table public.creator_projects (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, description text, cover_image text, default_style text default 'photorealistic', default_aspect text default '16:9',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.creator_episodes (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.creator_projects(id) on delete cascade,
  name text not null, description text, order_index integer not null default 0, status public.creator_episode_status not null default 'draft', script_content jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.creator_entities (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.creator_projects(id) on delete cascade,
  type public.creator_entity_type not null, name text not null, handle text not null, description text, reference_images text[] default '{}', voice_id text, metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (project_id, handle)
);
create table public.creator_shots (
  id uuid primary key default gen_random_uuid(), episode_id uuid not null references public.creator_episodes(id) on delete cascade,
  order_index integer not null default 0, title text not null, description text, script_text text, prompt text, keyframe_image text, video_url text,
  video_status public.creator_video_status not null default 'none', duration_seconds numeric default 4, aspect_ratio text default '16:9', resolution text default '720p', style text default 'photorealistic', model text default 'bytedance/seedance-2.0/image-to-video', referenced_entities uuid[] default '{}', metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.creator_chat_sessions (
  id uuid primary key default gen_random_uuid(), episode_id uuid not null references public.creator_episodes(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New Chat', mode public.creator_chat_mode not null default 'manual', model text default 'claude-sonnet-4-5', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.creator_chat_messages (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.creator_chat_sessions(id) on delete cascade, role public.creator_message_role not null, content text,
  tool_calls jsonb, suggested_actions jsonb, media jsonb, thinking text, referenced_entity_ids uuid[] default '{}', created_at timestamptz not null default now()
);
create table public.creator_generation_jobs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, session_id uuid references public.creator_chat_sessions(id) on delete set null, message_id uuid references public.creator_chat_messages(id) on delete set null, shot_id uuid references public.creator_shots(id) on delete set null,
  type public.creator_job_type not null, status public.creator_job_status not null default 'queued', model text not null, prompt text not null, input_images text[] default '{}', settings jsonb default '{}'::jsonb, estimated_credits integer not null default 0, requires_approval boolean not null default true, approved_at timestamptz, cancelled_at timestamptz, provider text default 'fal', provider_job_id text, provider_request jsonb, provider_response jsonb, result_url text, result_thumbnail text, credits_used integer default 0, error text, started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.creator_credit_transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, job_id uuid references public.creator_generation_jobs(id) on delete set null, amount integer not null, balance_after integer not null, description text, created_at timestamptz not null default now()
);

create index creator_projects_user_idx on public.creator_projects(user_id, created_at desc); create index creator_episodes_project_idx on public.creator_episodes(project_id, order_index); create index creator_entities_project_idx on public.creator_entities(project_id); create index creator_shots_episode_idx on public.creator_shots(episode_id, order_index); create index creator_sessions_episode_idx on public.creator_chat_sessions(episode_id); create index creator_messages_session_idx on public.creator_chat_messages(session_id, created_at); create index creator_jobs_user_idx on public.creator_generation_jobs(user_id, created_at desc);

create or replace function public.creator_touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger creator_projects_updated before update on public.creator_projects for each row execute function public.creator_touch_updated_at(); create trigger creator_episodes_updated before update on public.creator_episodes for each row execute function public.creator_touch_updated_at(); create trigger creator_entities_updated before update on public.creator_entities for each row execute function public.creator_touch_updated_at(); create trigger creator_shots_updated before update on public.creator_shots for each row execute function public.creator_touch_updated_at(); create trigger creator_sessions_updated before update on public.creator_chat_sessions for each row execute function public.creator_touch_updated_at(); create trigger creator_jobs_updated before update on public.creator_generation_jobs for each row execute function public.creator_touch_updated_at();

alter table public.creator_projects enable row level security; alter table public.creator_episodes enable row level security; alter table public.creator_entities enable row level security; alter table public.creator_shots enable row level security; alter table public.creator_chat_sessions enable row level security; alter table public.creator_chat_messages enable row level security; alter table public.creator_generation_jobs enable row level security; alter table public.creator_credit_transactions enable row level security;
create policy "creator projects owner" on public.creator_projects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "creator episodes owner" on public.creator_episodes for all using (exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid())) with check (exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "creator entities owner" on public.creator_entities for all using (exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid())) with check (exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "creator shots owner" on public.creator_shots for all using (exists (select 1 from public.creator_episodes e join public.creator_projects p on p.id = e.project_id where e.id = episode_id and p.user_id = auth.uid())) with check (exists (select 1 from public.creator_episodes e join public.creator_projects p on p.id = e.project_id where e.id = episode_id and p.user_id = auth.uid()));
create policy "creator sessions owner" on public.creator_chat_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "creator messages owner" on public.creator_chat_messages for all using (exists (select 1 from public.creator_chat_sessions s where s.id = session_id and s.user_id = auth.uid())) with check (exists (select 1 from public.creator_chat_sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy "creator jobs owner" on public.creator_generation_jobs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "creator credit owner" on public.creator_credit_transactions for select using (auth.uid() = user_id);

