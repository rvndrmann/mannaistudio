create table if not exists public.creator_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  episode_id uuid references public.creator_episodes(id) on delete cascade,
  session_id uuid references public.creator_chat_sessions(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  workflow_id text,
  objective text not null,
  status text not null default 'planning' check (status in ('queued','planning','awaiting_approval','running','retrying','blocked','completed','partially_completed','cancelled','failed')),
  current_step integer not null default 0,
  max_steps integer not null default 10 check (max_steps between 1 and 100),
  summary jsonb not null default '{}'::jsonb,
  error jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_workflow_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.creator_workflow_runs(id) on delete cascade,
  sequence integer not null,
  tool_execution_id uuid references public.creator_tool_executions(id) on delete set null,
  specialist text,
  label text not null,
  status text not null default 'pending' check (status in ('pending','running','awaiting_approval','completed','failed','cancelled','skipped')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error jsonb,
  attempt integer not null default 1,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, sequence, attempt)
);

create table if not exists public.creator_workflow_checkpoints (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.creator_workflow_runs(id) on delete cascade,
  step_sequence integer not null,
  state jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.creator_workflow_artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.creator_workflow_runs(id) on delete cascade,
  step_id uuid references public.creator_workflow_steps(id) on delete set null,
  artifact_type text not null check (artifact_type in ('entity','shot','image','video','audio','document','proposal','report')),
  entity_type text,
  entity_id text,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists creator_workflow_runs_project_idx on public.creator_workflow_runs(project_id, started_at desc);
create index if not exists creator_workflow_steps_run_idx on public.creator_workflow_steps(run_id, sequence, attempt);
create index if not exists creator_workflow_artifacts_run_idx on public.creator_workflow_artifacts(run_id, created_at);

alter table public.creator_workflow_runs enable row level security;
alter table public.creator_workflow_steps enable row level security;
alter table public.creator_workflow_checkpoints enable row level security;
alter table public.creator_workflow_artifacts enable row level security;

create policy "creator workflow runs owner" on public.creator_workflow_runs for select using (user_id = auth.uid());
create policy "creator workflow steps owner" on public.creator_workflow_steps for select using (exists (select 1 from public.creator_workflow_runs r where r.id = run_id and r.user_id = auth.uid()));
create policy "creator workflow checkpoints owner" on public.creator_workflow_checkpoints for select using (exists (select 1 from public.creator_workflow_runs r where r.id = run_id and r.user_id = auth.uid()));
create policy "creator workflow artifacts owner" on public.creator_workflow_artifacts for select using (exists (select 1 from public.creator_workflow_runs r where r.id = run_id and r.user_id = auth.uid()));

drop trigger if exists creator_workflow_runs_updated on public.creator_workflow_runs;
create trigger creator_workflow_runs_updated before update on public.creator_workflow_runs for each row execute function public.creator_touch_updated_at();

alter publication supabase_realtime add table public.creator_workflow_runs;
alter publication supabase_realtime add table public.creator_workflow_steps;
