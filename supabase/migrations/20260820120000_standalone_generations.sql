-- Generations that belong to no production, in a table of their own.
--
-- The studio's only way to reach an image or video model was through a
-- storyboard shot: a project, an episode, a shot row, then a render attached to
-- it. Someone who just wants a picture had to create a production first, and
-- the leftover project stayed in their list for ever.
--
-- An earlier draft of this migration recorded these as `creator_generation_jobs`
-- rows with a null `project_id`, which meant relaxing that table's insert and
-- update policies to accept a job naming no project. It never ran anywhere, and
-- it is not what ships: every query that reports on productions would have had
-- to keep filtering these out correctly for ever, and the two policies protect
-- exactly the invariant that a job belongs to a project the caller owns.
-- Widening a security policy so an unrelated feature can share a table is a bad
-- trade. This table is separate, so nothing about productions changes at all.
--
-- The two enums are shared deliberately: `image | video` and the job status
-- machine already say precisely the right thing, and a second copy of either
-- would drift.

create table if not exists public.creator_quick_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type public.creator_job_type not null,
  status public.creator_job_status not null default 'queued',
  provider text not null,
  model text not null,
  -- What the user typed, kept apart from what was sent. The composed prompt is
  -- what explains a result; the base prompt is what goes back in the box when
  -- they press Reuse, and stacking the two would degrade it on every reuse.
  prompt text not null,
  composed_prompt text,
  input_images text[] not null default '{}',
  settings jsonb not null default '{}'::jsonb,
  provider_job_id text,
  provider_response jsonb,
  -- A storage path, never a provider URL: those expire, and a history of dead
  -- links a day later is not a history.
  result_path text,
  error text,
  -- Which account paid, recorded rather than inferred afterwards. A BYOK job
  -- charges nothing, so credits_used is 0 — and a refund path that reads
  -- `credits_used || estimated_credits` falls through to the estimate and hands
  -- back credits nobody paid. See src/lib/byok/billing.ts.
  billing_mode text not null default 'credits' check (billing_mode in ('credits', 'byok')),
  estimated_credits integer not null default 0 check (estimated_credits >= 0),
  credits_used integer not null default 0 check (credits_used >= 0),
  credits_refunded integer not null default 0 check (credits_refunded >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The history page reads exactly this, newest first, optionally by type.
create index if not exists creator_quick_generations_user_idx
  on public.creator_quick_generations (user_id, created_at desc);
create index if not exists creator_quick_generations_user_type_idx
  on public.creator_quick_generations (user_id, type, created_at desc);
-- One provider task cannot back two rows; polling resolves a task exactly once.
create unique index if not exists creator_quick_generations_provider_task_idx
  on public.creator_quick_generations (provider, provider_job_id)
  where provider_job_id is not null;

drop trigger if exists creator_quick_generations_updated on public.creator_quick_generations;
create trigger creator_quick_generations_updated
  before update on public.creator_quick_generations
  for each row execute function public.creator_touch_updated_at();

alter table public.creator_quick_generations enable row level security;

-- Owner-only, and only the owner: these are not shared, not visible to a team,
-- and not part of any project someone else was granted access to. There is no
-- elaborate insert check of the kind `creator_generation_jobs` carries, because
-- there is nothing here for a client to forge that would gain it anything —
-- credits are moved by SECURITY DEFINER functions that check the caller, not by
-- writing a number into this table.
drop policy if exists "creator quick generations owner" on public.creator_quick_generations;
create policy "creator quick generations owner"
  on public.creator_quick_generations
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
