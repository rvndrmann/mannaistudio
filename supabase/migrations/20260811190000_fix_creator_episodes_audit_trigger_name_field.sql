-- Fix audit trigger for creator_episodes: creator_episodes table has column 'name', not 'title'.
-- Referencing new.title/old.title caused Postgres runtime error: record "new" has no field "title".

create or replace function public.creator_log_project_change()
returns trigger language plpgsql security definer set search_path = public as $$
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
$$;
