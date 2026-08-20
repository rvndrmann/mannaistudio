-- Generations that belong to no project.
--
-- The studio's only way to reach an image or video model was through a
-- storyboard shot: a project, an episode, a shot row, then a render attached to
-- it. Someone who just wants a picture had to create a production first, and
-- the leftover project stayed in their list for ever.
--
-- A standalone generation is the same job, recorded the same way, with no
-- project attached — `project_id is null` is what marks one. Everything that
-- reads jobs by project (the admin overview, per-episode credit totals) filters
-- on that column already, so these rows stay out of production accounting
-- without any of those queries changing.
--
-- Two policies stood in the way. Both required the job to name a project the
-- caller owns, so a null project_id could not be inserted, and a job that
-- somehow was could never be updated again — it would sit in `processing` for
-- ever with its credits unrefundable.

drop policy if exists "creator jobs request insert" on public.creator_generation_jobs;
create policy "creator jobs request insert" on public.creator_generation_jobs for insert with check (
  user_id = auth.uid()
  and status in ('awaiting_approval', 'approved')
  and provider_job_id is null
  and credits_used = 0
  and (
    project_id is null
    or exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid())
  )
);

drop policy if exists "creator jobs owner update" on public.creator_generation_jobs;
create policy "creator jobs owner update"
on public.creator_generation_jobs
for update
using (
  user_id = auth.uid()
  and (
    project_id is null
    or exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid())
  )
)
with check (
  user_id = auth.uid()
  and (
    project_id is null
    or exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid())
  )
);

-- The history page reads exactly this slice, newest first. The existing
-- (user_id, created_at desc) index would work, but a creator with a long
-- production history would have it walk every project job to find the handful
-- that belong to no project.
create index if not exists creator_generation_jobs_standalone_idx
  on public.creator_generation_jobs (user_id, created_at desc)
  where project_id is null;
