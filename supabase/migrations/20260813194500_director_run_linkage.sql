-- One user turn, its tool calls, approvals, and generated media share a stable
-- workflow run. This prevents stale proposal cards and unrelated pipeline
-- actions from being presented as the result of the current request.
alter table public.creator_chat_messages
  add column if not exists workflow_run_id uuid references public.creator_workflow_runs(id) on delete set null;

alter table public.creator_tool_executions
  add column if not exists workflow_run_id uuid references public.creator_workflow_runs(id) on delete set null;

alter table public.creator_action_proposals
  add column if not exists workflow_run_id uuid references public.creator_workflow_runs(id) on delete set null;

alter table public.creator_generation_jobs
  add column if not exists workflow_run_id uuid references public.creator_workflow_runs(id) on delete set null,
  add column if not exists target_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists verification jsonb not null default '{}'::jsonb;

create index if not exists creator_messages_run_idx
  on public.creator_chat_messages(workflow_run_id, created_at);
create index if not exists creator_tool_executions_run_idx
  on public.creator_tool_executions(workflow_run_id);
create index if not exists creator_proposals_run_idx
  on public.creator_action_proposals(workflow_run_id, created_at desc);
create index if not exists creator_generation_jobs_run_idx
  on public.creator_generation_jobs(workflow_run_id, created_at desc);

comment on column public.creator_generation_jobs.target_snapshot is
  'Immutable episode, shot, prompt hash, and entity-reference target approved for this generation.';
comment on column public.creator_generation_jobs.verification is
  'Post-generation checks proving that output was attached to the approved target.';
