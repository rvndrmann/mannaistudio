drop policy if exists "creator jobs owner update" on public.creator_generation_jobs;

create policy "creator jobs owner update"
on public.creator_generation_jobs
for update
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.creator_projects p
    where p.id = project_id
      and p.user_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.creator_projects p
    where p.id = project_id
      and p.user_id = auth.uid()
  )
);
