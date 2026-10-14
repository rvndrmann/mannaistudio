-- Storyboard review: the client signs off frames before they become a cut.
--
-- A managed client used to see nothing until a finished video, so a wrong face
-- or a wrong product angle was found after the clip had been paid for in
-- generation credits and edit time. The producer now picks keyframes, clips or
-- asset images from the Studio production and sends them as a numbered round;
-- the client approves each one or says what should change.
--
-- The internal/client line holds exactly as it does for deliverables: the
-- route copies each chosen file into `managed/{project_id}/storyboard/` before
-- this runs, so the client is never handed a path inside the studio prefix.
--
-- The client's answer is written in two places on purpose. Here, so the order
-- keeps a record of what was agreed in which round; and into the Studio
-- production's own revision thread on that shot (or asset), so the producer
-- reads it beside the frame they are about to regenerate rather than in a
-- second inbox. The client holds no grant on the Studio project — that write
-- is this function's, not theirs.

create table if not exists public.managed_storyboard_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.managed_projects(id) on delete cascade,
  -- Rounds are what a client means by "the second batch you sent". Earlier
  -- rounds stay readable; a regenerated frame arrives as a new item in a new
  -- round rather than overwriting the one that was commented on.
  round integer not null check (round > 0),
  position integer not null default 1,
  source_kind text not null check (source_kind in ('keyframe', 'clip', 'asset')),
  -- Where it came from in the Studio, so feedback can be filed against it.
  -- Set null rather than cascade: deleting a shot must not erase what the
  -- client said about it.
  studio_shot_id uuid references public.creator_shots(id) on delete set null,
  studio_entity_id uuid references public.creator_entities(id) on delete set null,
  title text not null default '' check (length(title) <= 200),
  caption text not null default '' check (length(caption) <= 1000),
  media_type text not null check (media_type in ('image', 'video')),
  storage_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested')),
  feedback text not null default '' check (length(feedback) <= 5000),
  responded_at timestamptz,
  sent_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint managed_storyboard_items_source check (
    (source_kind = 'asset' and studio_entity_id is not null and studio_shot_id is null)
    or (source_kind <> 'asset' and studio_entity_id is null)
  ),
  constraint managed_storyboard_items_changes_need_words check (
    status <> 'changes_requested' or length(btrim(feedback)) > 0
  )
);

create index if not exists managed_storyboard_items_project_idx
  on public.managed_storyboard_items (project_id, round desc, position);
create index if not exists managed_storyboard_items_shot_idx
  on public.managed_storyboard_items (studio_shot_id, created_at desc) where studio_shot_id is not null;
create index if not exists managed_storyboard_items_entity_idx
  on public.managed_storyboard_items (studio_entity_id, created_at desc) where studio_entity_id is not null;

alter table public.managed_storyboard_items enable row level security;

-- Read like every other child of an order. No write policy: sending is the
-- admin function's, answering is the client function's.
drop policy if exists "managed storyboard read" on public.managed_storyboard_items;
create policy "managed storyboard read" on public.managed_storyboard_items for select to authenticated
  using (public.can_access_managed_project(project_id));

/**
 * Sends a round of frames to the client.
 *
 * `p_items` is an array of
 *   { kind: keyframe|clip|asset, shotId?, entityId?, title, caption, path, mediaType }
 * where `path` is the copy the route already made under the client prefix.
 * Every source is checked against the order's own Studio production, so an
 * admin URL cannot hang a frame from somebody else's project on this order.
 */
create or replace function public.admin_managed_send_storyboard(
  p_project_id uuid,
  p_items jsonb,
  p_note text default ''
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_project public.managed_projects;
  v_round integer;
  v_position integer := 0;
  v_item jsonb;
  v_kind text;
  v_shot uuid;
  v_entity uuid;
  v_path text;
begin
  if not public.is_site_admin() then raise exception 'Only admins can send a storyboard'; end if;

  select * into v_project from public.managed_projects where id = p_project_id;
  if v_project.id is null then raise exception 'Project not found'; end if;
  if v_project.studio_project_id is null then raise exception 'Open the Creator Studio production for this order first'; end if;
  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Pick at least one frame to send';
  end if;
  if jsonb_array_length(p_items) > 40 then raise exception 'Send at most 40 frames in one round'; end if;
  if length(coalesce(p_note, '')) > 2000 then raise exception 'That note is too long'; end if;

  select coalesce(max(round), 0) + 1 into v_round
  from public.managed_storyboard_items where project_id = p_project_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_position := v_position + 1;
    v_kind := v_item->>'kind';
    v_shot := nullif(v_item->>'shotId', '')::uuid;
    v_entity := nullif(v_item->>'entityId', '')::uuid;
    v_path := coalesce(v_item->>'path', '');

    if v_path not like 'managed/' || p_project_id::text || '/storyboard/%' or v_path like '%..%' then
      raise exception 'A storyboard frame must live under this project''s client folder';
    end if;

    if v_kind in ('keyframe', 'clip') then
      if v_shot is null or not exists (
        select 1 from public.creator_shots s
        join public.creator_episodes e on e.id = s.episode_id
        where s.id = v_shot and e.project_id = v_project.studio_project_id
      ) then raise exception 'That shot is not in this order''s production'; end if;
      v_entity := null;
    elsif v_kind = 'asset' then
      if v_entity is null or not exists (
        select 1 from public.creator_entities where id = v_entity and project_id = v_project.studio_project_id
      ) then raise exception 'That asset is not in this order''s production'; end if;
      v_shot := null;
    else
      raise exception 'Unknown frame kind';
    end if;

    insert into public.managed_storyboard_items (
      project_id, round, position, source_kind, studio_shot_id, studio_entity_id,
      title, caption, media_type, storage_path, sent_by
    ) values (
      p_project_id, v_round, v_position, v_kind, v_shot, v_entity,
      left(coalesce(v_item->>'title', ''), 200), left(coalesce(v_item->>'caption', ''), 1000),
      case when v_item->>'mediaType' = 'video' then 'video' else 'image' end,
      v_path, auth.uid()
    );
  end loop;

  insert into public.managed_messages (project_id, sender_id, sender_is_admin, kind, body)
  values (
    p_project_id, auth.uid(), true, 'delivery',
    coalesce(nullif(btrim(p_note), ''),
      'Storyboard round ' || v_round || ' — ' || v_position || ' frame(s) are ready for your review.')
  );

  perform public.notify_managed(
    v_project.user_id, 'managed_delivery',
    'Storyboard round ' || v_round || ' is ready to review',
    v_position || ' frame(s) from ' || v_project.name || ' are waiting for your approval.', v_project.id
  );

  return v_round;
end;
$$;

revoke all on function public.admin_managed_send_storyboard(uuid, jsonb, text) from public, anon;
grant execute on function public.admin_managed_send_storyboard(uuid, jsonb, text) to authenticated;

/**
 * The client's answer to a round, frame by frame.
 *
 * `p_decisions` is an array of { itemId, decision: approved|changes_requested,
 * feedback }. One call for the whole review so the producer hears about it
 * once, through a single chat message, rather than once per frame.
 *
 * Each answer is also filed in the Studio production's revision thread for the
 * shot (image or video track) or asset it came from. An approval arrives
 * already resolved — there is nothing to do about it, but the producer should
 * still see that it was given before touching the frame again.
 */
create or replace function public.managed_submit_storyboard_review(
  p_project_id uuid,
  p_decisions jsonb
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_project public.managed_projects;
  v_decision jsonb;
  v_item public.managed_storyboard_items;
  v_status text;
  v_feedback text;
  v_body text;
  v_label text;
  v_shot_live boolean;
  v_entity_live boolean;
  v_approved integer := 0;
  v_changes integer := 0;
  v_rounds integer[] := '{}';
begin
  select * into v_project from public.managed_projects where id = p_project_id;
  if v_project.id is null then raise exception 'Project not found'; end if;
  if v_project.user_id is distinct from auth.uid() then
    raise exception 'Only the client can review their storyboard';
  end if;
  if jsonb_typeof(coalesce(p_decisions, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_decisions) = 0 then
    raise exception 'Approve or comment on at least one frame';
  end if;

  for v_decision in select value from jsonb_array_elements(p_decisions) loop
    select * into v_item from public.managed_storyboard_items
    where id = nullif(v_decision->>'itemId', '')::uuid and project_id = p_project_id
    for update;
    if v_item.id is null then raise exception 'That frame is not on this project'; end if;
    if v_item.status <> 'pending' then continue; end if;

    v_status := v_decision->>'decision';
    v_feedback := btrim(coalesce(v_decision->>'feedback', ''));
    if v_status not in ('approved', 'changes_requested') then raise exception 'Unknown decision'; end if;
    if v_status = 'changes_requested' and v_feedback = '' then
      raise exception 'Say what should change on "%"', coalesce(nullif(v_item.title, ''), 'this frame');
    end if;

    update public.managed_storyboard_items
    set status = v_status, feedback = left(v_feedback, 5000), responded_at = now()
    where id = v_item.id;

    if v_status = 'approved' then v_approved := v_approved + 1; else v_changes := v_changes + 1; end if;
    if not v_item.round = any(v_rounds) then v_rounds := v_rounds || v_item.round; end if;

    -- Into the Studio, beside the frame. The shot or asset may have been
    -- deleted since it was sent; then the note goes to the project thread with
    -- the frame named, rather than being dropped.
    v_label := coalesce(nullif(v_item.title, ''), 'Frame ' || v_item.position);
    v_body := 'Client storyboard review · Round ' || v_item.round || ' · ' || v_label || E'\n'
      || case when v_status = 'approved' then 'Approved.' else 'Changes requested: ' || v_feedback end
      || case when v_status = 'approved' and v_feedback <> '' then E'\n' || v_feedback else '' end;

    v_shot_live := v_item.studio_shot_id is not null and exists (
      select 1 from public.creator_shots s join public.creator_episodes e on e.id = s.episode_id
      where s.id = v_item.studio_shot_id and e.project_id = v_project.studio_project_id
    );
    v_entity_live := v_item.studio_entity_id is not null and exists (
      select 1 from public.creator_entities where id = v_item.studio_entity_id and project_id = v_project.studio_project_id
    );

    if v_project.studio_project_id is not null
      and exists (select 1 from public.creator_projects where id = v_project.studio_project_id) then
      insert into public.creator_shot_comments (
        shot_id, entity_id, track, project_id, author_id, body, resolved_at, resolved_by
      ) values (
        case when v_shot_live then v_item.studio_shot_id end,
        case when v_entity_live then v_item.studio_entity_id end,
        case when v_shot_live then (case when v_item.source_kind = 'clip' then 'video' else 'image' end) end,
        v_project.studio_project_id, auth.uid(), left(v_body, 5000),
        case when v_status = 'approved' then now() end,
        case when v_status = 'approved' then auth.uid() end
      );
    end if;
  end loop;

  if v_approved + v_changes = 0 then raise exception 'Those frames have already been reviewed'; end if;

  -- One message, which the existing chat trigger turns into one notification
  -- for the team.
  insert into public.managed_messages (project_id, sender_id, sender_is_admin, kind, body)
  values (
    p_project_id, auth.uid(), false, 'chat',
    'Storyboard review' || case when cardinality(v_rounds) = 1 then ' (round ' || v_rounds[1] || ')' else '' end
      || ': ' || v_approved || ' approved, ' || v_changes || ' with changes requested.'
  );

  return v_approved + v_changes;
end;
$$;

revoke all on function public.managed_submit_storyboard_review(uuid, jsonb) from public, anon;
grant execute on function public.managed_submit_storyboard_review(uuid, jsonb) to authenticated;
