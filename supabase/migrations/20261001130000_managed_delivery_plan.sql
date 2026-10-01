alter table public.managed_projects
  add column if not exists delivery_due_at timestamptz,
  add column if not exists client_update text not null default '',
  add column if not exists remaining_tasks text[] not null default '{}',
  add column if not exists completed_at timestamptz;

create or replace function public.admin_managed_set_delivery_plan(
  p_project_id uuid, p_due_at timestamptz, p_update text, p_remaining text[]
) returns public.managed_projects
language plpgsql security definer set search_path = public as $$
declare p public.managed_projects; message text;
begin
  if not public.is_site_admin() then raise exception 'Admins only'; end if;
  if length(coalesce(p_update,'')) > 3000 or cardinality(coalesce(p_remaining,'{}'::text[])) > 30 then raise exception 'Invalid plan'; end if;
  if exists(select 1 from unnest(p_remaining) task where length(task) > 300 or length(trim(task)) = 0) then raise exception 'Invalid task'; end if;
  select * into p from managed_projects where id = p_project_id for update;
  if p.id is null then raise exception 'Project not found'; end if;
  if p.payment_status not in ('paid','proposal_requested') then raise exception 'Order is not confirmed'; end if;
  if p.delivery_due_at is not distinct from p_due_at and p.client_update = coalesce(p_update,'') and p.remaining_tasks = coalesce(p_remaining,'{}'::text[]) then return p; end if;
  update managed_projects set delivery_due_at = p_due_at, client_update = coalesce(p_update,''),
    remaining_tasks = coalesce(p_remaining,'{}'::text[]) where id = p_project_id returning * into p;
  message := 'Production update' || case when p.client_update <> '' then E'\n' || p.client_update else '' end;
  message := message || case when p.delivery_due_at is null then E'\nDelivery date: the team will confirm.'
    else E'\nExpected delivery: ' || to_char(p.delivery_due_at at time zone 'Asia/Kolkata','DD Mon YYYY HH24:MI') || ' IST' end;
  if cardinality(p.remaining_tasks) > 0 then message := message || E'\nRemaining: ' || array_to_string(p.remaining_tasks,'; '); end if;
  insert into managed_messages(project_id,sender_id,sender_is_admin,kind,body)
    values(p.id,auth.uid(),true,'chat',message);
  return p;
end; $$;
revoke all on function public.admin_managed_set_delivery_plan(uuid,timestamptz,text,text[]) from public,anon;
grant execute on function public.admin_managed_set_delivery_plan(uuid,timestamptz,text,text[]) to authenticated;

-- Changes to production status also appear in the customer's existing chat.
-- Internal notes are deliberately never interpolated into these messages.
create or replace function public.managed_post_status_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare label text; sender uuid;
begin
  if new.status is not distinct from old.status then return new; end if;
  label := case new.status
    when 'brief_received' then 'Brief received' when 'creative_research' then 'Creative research'
    when 'script_in_progress' then 'Script in progress' when 'script_review' then 'Script ready for review'
    when 'production' then 'Production' when 'first_cut' then 'First cut ready'
    when 'revision_requested' then 'Revisions in progress' when 'finalizing' then 'Finalizing'
    when 'completed' then 'Completed — final deliverables are available in your project'
    when 'cancelled' then 'Cancelled' else new.status end;
  -- Approval can be performed by the customer. Do not label their identity as
  -- a producer; use an actual site admin as the system's team sender.
  select id into sender from public.admin_users order by id limit 1;
  if sender is not null then
    insert into managed_messages(project_id,sender_id,sender_is_admin,kind,body)
      values(new.id,sender,true,'chat','Project status: ' || label);
  end if;
  return new;
end; $$;
drop trigger if exists managed_project_chat_status on public.managed_projects;
create trigger managed_project_chat_status after update of status on public.managed_projects
for each row execute function public.managed_post_status_update();
revoke all on function public.managed_post_status_update() from public,anon,authenticated;

-- A status button must not claim delivery before the purchased files exist.
create or replace function public.managed_require_complete_delivery()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    if new.payment_status <> 'paid'
      or (select count(*) from managed_deliverables where project_id = new.id) < new.video_count
      or exists (
        select 1 from managed_deliverables d where d.project_id = new.id and (
          d.status <> 'approved' or not exists (
            select 1 from managed_deliverable_versions v where v.deliverable_id = d.id
              and v.project_id = new.id and v.is_final
              and v.storage_path like 'managed/' || new.id::text || '/deliverables/%'
          )
        )
      ) then raise exception 'Approve and publish every purchased deliverable before completing this project'; end if;
    new.completed_at := now();
  elsif old.status = 'completed' and new.status <> 'completed' then
    new.completed_at := null;
  end if;
  return new;
end; $$;
drop trigger if exists managed_complete_delivery_guard on public.managed_projects;
create trigger managed_complete_delivery_guard before update of status on public.managed_projects
for each row execute function public.managed_require_complete_delivery();
revoke all on function public.managed_require_complete_delivery() from public,anon,authenticated;
