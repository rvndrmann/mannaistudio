-- Story hierarchy and practical continuity facts. Existing entity enum values remain unchanged.
alter table public.creator_entities
  add column if not exists kind text not null default 'generic',
  add column if not exists approval_status text not null default 'draft'
    check (approval_status in ('draft', 'pending', 'approved', 'rejected', 'locked'));

create index if not exists creator_entities_kind_idx on public.creator_entities(project_id, kind, approval_status);

create table if not exists public.creator_continuity_facts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  entity_id uuid references public.creator_entities(id) on delete cascade,
  scope text not null default 'project' check (scope in ('project', 'series', 'season', 'episode', 'scene', 'shot')),
  scope_id uuid,
  category text not null,
  fact_key text not null,
  fact_value jsonb not null,
  source_asset_id uuid references public.creator_reference_assets(id) on delete set null,
  status text not null default 'approved' check (status in ('proposed', 'approved', 'superseded')),
  locked boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_continuity_issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  episode_id uuid references public.creator_episodes(id) on delete cascade,
  scene_id uuid references public.creator_scenes(id) on delete cascade,
  shot_id uuid references public.creator_shots(id) on delete cascade,
  entity_id uuid references public.creator_entities(id) on delete set null,
  category text not null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'blocking')),
  description text not null,
  expected jsonb,
  observed jsonb,
  status text not null default 'open' check (status in ('open', 'accepted', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists creator_continuity_facts_project_idx on public.creator_continuity_facts(project_id, entity_id, category);
create index if not exists creator_continuity_issues_project_idx on public.creator_continuity_issues(project_id, status, severity);

alter table public.creator_continuity_facts enable row level security;
alter table public.creator_continuity_issues enable row level security;

create policy "creator continuity facts owner" on public.creator_continuity_facts for all
using (exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid()))
with check (exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "creator continuity issues owner" on public.creator_continuity_issues for all
using (exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid()))
with check (exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid()));

drop trigger if exists creator_continuity_facts_updated on public.creator_continuity_facts;
create trigger creator_continuity_facts_updated before update on public.creator_continuity_facts
for each row execute function public.creator_touch_updated_at();
