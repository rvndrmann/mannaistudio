-- AI Director foundation. Additive only: existing Creator Studio records and flows remain valid.
create extension if not exists pgcrypto;

alter table public.creator_projects
  add column if not exists production_mode text not null default 'legacy'
    check (production_mode in ('legacy', 'quick_video', 'story_campaign', 'ai_show')),
  add column if not exists project_type text not null default 'unspecified'
    check (project_type in ('unspecified', 'ai_ad', 'brand_series', 'short_drama', 'narrative_film')),
  add column if not exists creative_brief jsonb not null default '{}'::jsonb,
  add column if not exists platform text,
  add column if not exists target_duration_seconds integer check (target_duration_seconds is null or target_duration_seconds > 0),
  add column if not exists language text,
  add column if not exists advanced_details_enabled boolean not null default false,
  add column if not exists memory_summary text,
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists schema_version integer not null default 1;

create table if not exists public.creator_brand_profiles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  name text not null,
  brand_voice text,
  visual_identity jsonb not null default '{}'::jsonb,
  forbidden_claims text[] not null default '{}',
  cta_rules jsonb not null default '{}'::jsonb,
  product_placement_rules jsonb not null default '{}'::jsonb,
  campaign_objectives jsonb not null default '{}'::jsonb,
  publishing_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.creator_projects
  add column if not exists brand_profile_id uuid references public.creator_brand_profiles(id) on delete set null;

create table if not exists public.creator_series (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  name text not null,
  premise text,
  genre text,
  tone text,
  audience text,
  format jsonb not null default '{}'::jsonb,
  bible jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_seasons (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.creator_series(id) on delete cascade,
  number integer not null check (number > 0),
  name text,
  arc text,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (series_id, number)
);

alter table public.creator_episodes
  add column if not exists season_id uuid references public.creator_seasons(id) on delete set null,
  add column if not exists episode_number integer check (episode_number is null or episode_number > 0),
  add column if not exists continuity_state jsonb not null default '{}'::jsonb;

create table if not exists public.creator_scenes (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.creator_episodes(id) on delete cascade,
  order_index integer not null default 0,
  name text not null,
  synopsis text,
  script_content jsonb not null default '{}'::jsonb,
  continuity_requirements jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'approved', 'locked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.creator_shots
  add column if not exists scene_id uuid references public.creator_scenes(id) on delete set null,
  add column if not exists locked_fields text[] not null default '{}',
  add column if not exists continuity_requirements jsonb not null default '{}'::jsonb;

create table if not exists public.creator_reference_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  entity_id uuid references public.creator_entities(id) on delete set null,
  storage_bucket text not null default 'creator-studio-media',
  storage_path text not null,
  media_type text not null check (media_type in ('image', 'video', 'audio', 'document')),
  purpose text,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  metadata jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, storage_bucket, storage_path)
);

create table if not exists public.creator_project_memory (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  scope text not null default 'project' check (scope in ('project', 'series', 'season', 'episode')),
  scope_id uuid,
  memory_type text not null,
  content jsonb not null,
  source text not null default 'user',
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_tool_executions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.creator_chat_sessions(id) on delete set null,
  message_id uuid references public.creator_chat_messages(id) on delete set null,
  tool_name text not null,
  tool_version integer not null default 1,
  risk text not null check (risk in ('read', 'write', 'costly', 'destructive')),
  status text not null default 'started' check (status in ('started', 'awaiting_approval', 'completed', 'failed', 'cancelled')),
  idempotency_key text,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, idempotency_key)
);

create table if not exists public.creator_action_proposals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tool_execution_id uuid references public.creator_tool_executions(id) on delete set null,
  action_type text not null,
  title text not null,
  summary text,
  payload jsonb not null,
  estimated_credits integer not null default 0 check (estimated_credits >= 0),
  affected_entities jsonb not null default '[]'::jsonb,
  replaced_assets jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'executed', 'failed')),
  expires_at timestamptz,
  decided_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.creator_audit_events (
  id bigint generated always as identity primary key,
  project_id uuid references public.creator_projects(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  actor_type text not null check (actor_type in ('user', 'ai_director', 'system', 'provider', 'admin')),
  event_type text not null,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists creator_series_project_idx on public.creator_series(project_id, created_at);
create index if not exists creator_seasons_series_idx on public.creator_seasons(series_id, number);
create index if not exists creator_scenes_episode_idx on public.creator_scenes(episode_id, order_index);
create index if not exists creator_reference_assets_project_idx on public.creator_reference_assets(project_id, approval_status);
create index if not exists creator_project_memory_project_idx on public.creator_project_memory(project_id, scope, memory_type);
create index if not exists creator_tool_executions_project_idx on public.creator_tool_executions(project_id, started_at desc);
create index if not exists creator_action_proposals_project_idx on public.creator_action_proposals(project_id, status, created_at desc);
create index if not exists creator_audit_events_project_idx on public.creator_audit_events(project_id, created_at desc);

insert into public.site_settings (key, value)
values ('studio_features', '{"ai_director_text_enabled":false,"ai_director_tools_enabled":false,"production_modes_enabled":false,"generation_jobs_enabled":false,"voice_director_enabled":false,"series_hierarchy_enabled":false,"continuity_checks_enabled":false,"auto_model_routing_enabled":false,"studio_export_enabled":false}'::jsonb)
on conflict (key) do nothing;

alter table public.creator_brand_profiles enable row level security;
alter table public.creator_series enable row level security;
alter table public.creator_seasons enable row level security;
alter table public.creator_scenes enable row level security;
alter table public.creator_reference_assets enable row level security;
alter table public.creator_project_memory enable row level security;
alter table public.creator_user_preferences enable row level security;
alter table public.creator_tool_executions enable row level security;
alter table public.creator_action_proposals enable row level security;
alter table public.creator_audit_events enable row level security;

create policy "creator brand profiles owner" on public.creator_brand_profiles for all using (exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid())) with check (exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "creator series owner" on public.creator_series for all using (exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid())) with check (exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "creator seasons owner" on public.creator_seasons for all using (exists (select 1 from public.creator_series s join public.creator_projects p on p.id = s.project_id where s.id = series_id and p.user_id = auth.uid())) with check (exists (select 1 from public.creator_series s join public.creator_projects p on p.id = s.project_id where s.id = series_id and p.user_id = auth.uid()));
create policy "creator scenes owner" on public.creator_scenes for all using (exists (select 1 from public.creator_episodes e join public.creator_projects p on p.id = e.project_id where e.id = episode_id and p.user_id = auth.uid())) with check (exists (select 1 from public.creator_episodes e join public.creator_projects p on p.id = e.project_id where e.id = episode_id and p.user_id = auth.uid()));
create policy "creator reference assets owner" on public.creator_reference_assets for all using (exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid())) with check (exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "creator project memory owner" on public.creator_project_memory for all using (exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid())) with check (exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "creator preferences owner" on public.creator_user_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "creator tool executions read" on public.creator_tool_executions for select using (user_id = auth.uid());
create policy "creator tool executions insert" on public.creator_tool_executions for insert with check (user_id = auth.uid() and risk = 'read');
create policy "creator action proposals owner" on public.creator_action_proposals for select using (user_id = auth.uid());
create policy "creator audit events owner read" on public.creator_audit_events for select using (user_id = auth.uid());

drop trigger if exists creator_brand_profiles_updated on public.creator_brand_profiles;
create trigger creator_brand_profiles_updated before update on public.creator_brand_profiles for each row execute function public.creator_touch_updated_at();
drop trigger if exists creator_series_updated on public.creator_series;
create trigger creator_series_updated before update on public.creator_series for each row execute function public.creator_touch_updated_at();
drop trigger if exists creator_seasons_updated on public.creator_seasons;
create trigger creator_seasons_updated before update on public.creator_seasons for each row execute function public.creator_touch_updated_at();
drop trigger if exists creator_scenes_updated on public.creator_scenes;
create trigger creator_scenes_updated before update on public.creator_scenes for each row execute function public.creator_touch_updated_at();
drop trigger if exists creator_project_memory_updated on public.creator_project_memory;
create trigger creator_project_memory_updated before update on public.creator_project_memory for each row execute function public.creator_touch_updated_at();

-- Rollback guidance: drop only the new tables/policies/indexes and then the new nullable/defaulted
-- columns. No existing creator_* row is rewritten by this migration.
