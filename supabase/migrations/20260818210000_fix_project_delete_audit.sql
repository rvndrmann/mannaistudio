-- Deleting a project failed once it had any content.
--
-- Removing a project cascades to its episodes, entities, and shots, and each of
-- those deletes fires the attribution trigger, which writes an audit row
-- pointing at the project. By then the project row is already gone, so the
-- audit table's foreign key rejects it and the whole delete fails with
-- "insert or update on table creator_audit_events violates foreign key
-- constraint". The user just sees a delete that does not work.
--
-- There is nothing to attribute in that case: the thing the record would hang
-- off is being removed in the same statement. So a delete whose owning project
-- has already gone is skipped, and every other change is logged exactly as
-- before.

create or replace function public.creator_log_project_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  target_project uuid;
  target_id uuid;
  label text;
  actor uuid := auth.uid();
  role_name text;
  action text := lower(tg_op);
begin
  if tg_table_name = 'creator_shots' then
    if tg_op = 'DELETE' then
      select e.project_id into target_project from public.creator_episodes e where e.id = old.episode_id;
      target_id := old.id;
      label := coalesce(nullif(old.title, ''), 'shot');
    else
      select e.project_id into target_project from public.creator_episodes e where e.id = new.episode_id;
      target_id := new.id;
      label := coalesce(nullif(new.title, ''), 'shot');
    end if;

  elsif tg_table_name = 'creator_entities' then
    if tg_op = 'DELETE' then
      target_project := old.project_id;
      target_id := old.id;
      label := coalesce(nullif(old.name, ''), 'asset');
    else
      target_project := new.project_id;
      target_id := new.id;
      label := coalesce(nullif(new.name, ''), 'asset');
    end if;

  elsif tg_table_name = 'creator_episodes' then
    if tg_op = 'DELETE' then
      target_project := old.project_id;
      target_id := old.id;
      label := coalesce(nullif(old.name, ''), 'episode');
    else
      -- Script edits are the interesting episode change; ignore unrelated churn so the log stays readable.
      if tg_op = 'UPDATE' and new.script_content is not distinct from old.script_content then
        return new;
      end if;
      target_project := new.project_id;
      target_id := new.id;
      label := coalesce(nullif(new.name, ''), 'episode');
    end if;

  else
    return null;
  end if;

  if target_project is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- The project is on its way out and these children are going with it.
  if tg_op = 'DELETE' and not exists (select 1 from public.creator_projects where id = target_project) then
    return old;
  end if;

  role_name := public.creator_actor_role(target_project, actor);

  insert into public.creator_audit_events (project_id, user_id, actor_type, actor_role, event_type, entity_type, entity_id, details)
  values (
    target_project,
    actor,
    case when role_name = 'enterprise_team' then 'admin' when actor is null then 'system' else 'user' end,
    role_name,
    tg_table_name || '.' || action,
    tg_table_name,
    target_id,
    jsonb_build_object('label', label, 'operation', action)
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;
