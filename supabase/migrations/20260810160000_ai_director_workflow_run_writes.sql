create policy "creator workflow runs insert" on public.creator_workflow_runs
for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid())
);

create policy "creator workflow runs update" on public.creator_workflow_runs
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "creator workflow steps insert" on public.creator_workflow_steps
for insert with check (exists (select 1 from public.creator_workflow_runs r where r.id = run_id and r.user_id = auth.uid()));

create policy "creator workflow steps update" on public.creator_workflow_steps
for update using (exists (select 1 from public.creator_workflow_runs r where r.id = run_id and r.user_id = auth.uid()))
with check (exists (select 1 from public.creator_workflow_runs r where r.id = run_id and r.user_id = auth.uid()));

create policy "creator workflow checkpoints insert" on public.creator_workflow_checkpoints
for insert with check (exists (select 1 from public.creator_workflow_runs r where r.id = run_id and r.user_id = auth.uid()));

create policy "creator workflow artifacts insert" on public.creator_workflow_artifacts
for insert with check (exists (select 1 from public.creator_workflow_runs r where r.id = run_id and r.user_id = auth.uid()));
