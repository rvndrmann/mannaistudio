-- Close out Director runs whose server or browser went away.
--
-- The application already does this, but only while reading a workspace: the
-- sweep runs when someone opens the project page. A run nobody goes back to
-- therefore stays "running" for good, and the chat that was waiting on it waits
-- for good too. This is the same rule with no browser involved.
--
-- The two bounds mirror src/lib/studio/workflow-runs.ts exactly, and have to be
-- changed together:
--   run_hard_timeout   330s  — the chat route's maxDuration (300s) plus a grace.
--                              A run executes inside that request, so one older
--                              than this cannot still be working.
--   silent_after       8min  — a run still working writes a step per tool.

create extension if not exists pg_cron;

create or replace function public.close_abandoned_workflow_runs()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  closed integer;
begin
  with dead as (
    select id, (summary ? 'client_disconnected_at') as client_left
    from public.creator_workflow_runs
    where completed_at is null
      and status in ('queued', 'planning', 'running', 'retrying')
      and started_at is not null
      and (
        started_at < now() - interval '330 seconds'
        or coalesce(updated_at, started_at) < now() - interval '8 minutes'
      )
  )
  update public.creator_workflow_runs as runs
  set status = 'failed',
      completed_at = now(),
      -- The same two endings the application writes, told apart the same way,
      -- so a run closed here reads no differently from one closed on a read.
      error = case when dead.client_left then
        jsonb_build_object(
          'code', 'run_disconnected',
          'message', 'This run stopped when the page it was streaming to was closed or reloaded. Nothing was charged for the unfinished work — send it again to pick up.')
      else
        jsonb_build_object(
          'code', 'run_interrupted',
          'message', 'This run stopped before it could reply — the server handling it went away. Nothing was charged for the unfinished work.')
      end
  from dead
  where runs.id = dead.id
    and runs.completed_at is null;
  get diagnostics closed = row_count;
  return closed;
end;
$$;

revoke all on function public.close_abandoned_workflow_runs() from public, anon, authenticated;

-- Every minute: the cost is one indexed scan that almost always matches nothing,
-- and the benefit is that a dead run is never waited on for longer than that.
select cron.unschedule('close-abandoned-workflow-runs')
where exists (select 1 from cron.job where jobname = 'close-abandoned-workflow-runs');

select cron.schedule('close-abandoned-workflow-runs', '* * * * *', 'select public.close_abandoned_workflow_runs()');
