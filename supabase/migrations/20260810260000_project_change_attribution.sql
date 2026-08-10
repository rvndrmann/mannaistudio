-- Attribute every project change to the person who made it, and to their
-- relationship with the project.
--
-- creator_audit_events existed but only the Director tool service wrote to it,
-- so edits made through the workspace routes or the Studio UI left no trace. On
-- an enterprise engagement the client and the production team edit the same
-- script and storyboard, and nothing recorded which of them did what.
--
-- Triggers are used rather than application code so no write path can bypass
-- the record, whichever route or tool performs it.

alter table public.creator_audit_events
  add column if not exists actor_role text;

create index if not exists creator_audit_events_project_idx
  on public.creator_audit_events (project_id, created_at desc);

-- owner: the account the project belongs to.
-- enterprise_team: an admin working the project through an accepted order.
-- collaborator: a shared team member.
create or replace function public.creator_actor_role(p_project_id uuid, p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p_user_id is null then 'system'
    when exists (select 1 from public.creator_projects p where p.id = p_project_id and p.user_id = p_user_id) then 'owner'
    when exists (
      select 1 from public.enterprise_orders o
      where o.project_id = p_project_id
        and o.status in ('quoted', 'in_production', 'delivered')
    ) and exists (select 1 from public.admin_users a where a.id = p_user_id) then 'enterprise_team'
    when exists (
      select 1 from public.creator_project_members m
      where m.project_id = p_project_id and m.profile_id = p_user_id
    ) then 'collaborator'
    else 'unknown'
  end;
$$;

grant execute on function public.creator_actor_role(uuid, uuid) to authenticated;

create or replace function public.creator_log_project_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_project uuid;
  target_id uuid;
  label text;
  actor uuid := auth.uid();
  role_name text;
  action text := lower(tg_op);
  row_data record;
begin
  row_data := case when tg_op = 'DELETE' then old else new end;

  -- Resolve the owning project for whichever table fired this trigger.
  if tg_table_name = 'creator_shots' then
    select e.project_id into target_project from public.creator_episodes e where e.id = row_data.episode_id;
    target_id := row_data.id;
    label := coalesce(nullif(row_data.title, ''), 'shot');
  elsif tg_table_name = 'creator_entities' then
    target_project := row_data.project_id;
    target_id := row_data.id;
    label := coalesce(nullif(row_data.name, ''), 'asset');
  elsif tg_table_name = 'creator_episodes' then
    target_project := row_data.project_id;
    target_id := row_data.id;
    label := coalesce(nullif(row_data.title, ''), 'episode');
  else
    return row_data;
  end if;

  if target_project is null then return row_data; end if;

  -- Script edits are the interesting episode change; ignore unrelated churn so
  -- the log stays readable.
  if tg_table_name = 'creator_episodes' and tg_op = 'UPDATE'
     and new.script_content is not distinct from old.script_content then
    return new;
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

  return row_data;
end;
$$;

drop trigger if exists creator_shots_audit on public.creator_shots;
create trigger creator_shots_audit
  after insert or update or delete on public.creator_shots
  for each row execute function public.creator_log_project_change();

drop trigger if exists creator_entities_audit on public.creator_entities;
create trigger creator_entities_audit
  after insert or update or delete on public.creator_entities
  for each row execute function public.creator_log_project_change();

drop trigger if exists creator_episodes_audit on public.creator_episodes;
create trigger creator_episodes_audit
  after insert or update or delete on public.creator_episodes
  for each row execute function public.creator_log_project_change();

-- Everyone with project access can read the history; it is the shared record of
-- who changed what, which is the point of keeping it.
drop policy if exists "creator audit events project read" on public.creator_audit_events;
create policy "creator audit events project read"
  on public.creator_audit_events for select
  to authenticated
  using (project_id is not null and public.can_access_creator_project(project_id));

create or replace function public.project_activity(p_project_id uuid, p_limit integer default 60)
returns table (
  id bigint,
  created_at timestamptz,
  actor_role text,
  actor_name text,
  actor_email text,
  event_type text,
  entity_type text,
  details jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.can_access_creator_project(p_project_id) then raise exception 'Project not found'; end if;

  return query
    select a.id, a.created_at, coalesce(a.actor_role, 'unknown'), p.full_name, p.email,
           a.event_type, a.entity_type, a.details
    from public.creator_audit_events a
    left join public.profiles p on p.id = a.user_id
    where a.project_id = p_project_id
    order by a.created_at desc
    limit least(greatest(coalesce(p_limit, 60), 1), 200);
end;
$$;

grant execute on function public.project_activity(uuid, integer) to authenticated;
