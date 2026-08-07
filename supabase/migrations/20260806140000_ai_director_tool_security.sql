-- Authenticated proposal and audit functions. Tool execution remains server orchestrated.
create policy "creator action proposals insert" on public.creator_action_proposals
for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid())
);

create policy "creator audit events insert" on public.creator_audit_events
for insert with check (
  user_id = auth.uid()
  and (project_id is null or exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid()))
);

drop policy if exists "creator tool executions insert" on public.creator_tool_executions;
create policy "creator tool executions insert" on public.creator_tool_executions
for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.creator_projects p where p.id = project_id and p.user_id = auth.uid())
);

create or replace function public.creator_finish_tool_execution(
  p_execution_id uuid,
  p_status text,
  p_output jsonb default null,
  p_error jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('completed', 'failed', 'cancelled') then raise exception 'invalid status'; end if;
  update public.creator_tool_executions
  set status = p_status, output = p_output, error = p_error, completed_at = now()
  where id = p_execution_id and user_id = auth.uid() and status in ('started', 'awaiting_approval');
  return found;
end;
$$;

grant execute on function public.creator_finish_tool_execution(uuid, text, jsonb, jsonb) to authenticated;

create or replace function public.creator_decide_action_proposal(
  p_proposal_id uuid,
  p_decision text
)
returns public.creator_action_proposals
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.creator_action_proposals;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision';
  end if;

  update public.creator_action_proposals
  set status = p_decision, decided_at = now()
  where id = p_proposal_id
    and user_id = auth.uid()
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  returning * into result;

  if result.id is null then raise exception 'proposal unavailable'; end if;
  return result;
end;
$$;

grant execute on function public.creator_decide_action_proposal(uuid, text) to authenticated;

create or replace function public.creator_finish_action_proposal(
  p_proposal_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('executed', 'failed') then raise exception 'invalid status'; end if;
  update public.creator_action_proposals
  set status = p_status, executed_at = case when p_status = 'executed' then now() else executed_at end
  where id = p_proposal_id and user_id = auth.uid() and status = 'approved';
  return found;
end;
$$;

grant execute on function public.creator_finish_action_proposal(uuid, text) to authenticated;
