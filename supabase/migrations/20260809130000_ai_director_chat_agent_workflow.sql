alter table public.creator_projects
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists creator_projects_metadata_gin
  on public.creator_projects using gin (metadata);

