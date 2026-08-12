-- creator_action_proposals had INSERT and SELECT policies but no UPDATE policy,
-- so persisting a proposal payload edited in the chat generation block was
-- silently denied by RLS. Execution used the merged payload from memory, so the
-- generation was correct while the stored record kept the superseded settings.
--
-- Scoped to the owner and to proposals still in flight. creator_decide_action_
-- proposal flips status to 'approved' before the payload is written, so both
-- states are allowed; an executed, failed, or rejected proposal is a historical
-- record and stays immutable.
create policy "creator action proposals owner update" on public.creator_action_proposals
for update using (
  user_id = auth.uid()
  and status in ('pending', 'approved')
  and exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid())
) with check (
  user_id = auth.uid()
  and exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid())
);
