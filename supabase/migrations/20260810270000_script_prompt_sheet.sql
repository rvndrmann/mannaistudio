-- The prompt sheet: one saved prompt per shot for the whole script.
--
-- The Prompt Agent writes these in a single pass over the saved script before
-- any art or video exists, and the Storyboard Agent generates from them rather
-- than inventing a prompt at generation time. Storing them makes the plan
-- reviewable and editable instead of a one-shot decision buried in chat.

create table if not exists public.creator_script_prompts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  episode_id uuid not null references public.creator_episodes(id) on delete cascade,
  order_index integer not null,
  title text not null default '',
  prompt text not null,
  -- Canonical entity names this prompt needs, so the Character & Asset Agent
  -- knows what art to build and the Storyboard Agent knows what to attach.
  entity_names text[] not null default '{}',
  shot_id uuid references public.creator_shots(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (episode_id, order_index)
);

create index if not exists creator_script_prompts_episode_idx
  on public.creator_script_prompts (episode_id, order_index);

alter table public.creator_script_prompts enable row level security;

drop policy if exists "creator script prompts read" on public.creator_script_prompts;
create policy "creator script prompts read" on public.creator_script_prompts for select
  to authenticated using (public.can_access_creator_project(project_id));

drop policy if exists "creator script prompts write" on public.creator_script_prompts;
create policy "creator script prompts write" on public.creator_script_prompts for all
  to authenticated
  using (public.can_edit_creator_project(project_id))
  with check (public.can_edit_creator_project(project_id));

-- Replaces the sheet for an episode in one call, so a regenerated sheet cannot
-- leave a half-updated mix of old and new prompts behind.
create or replace function public.save_script_prompt_sheet(p_episode_id uuid, p_prompts jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  target_project uuid;
  saved integer := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select project_id into target_project from public.creator_episodes where id = p_episode_id;
  if target_project is null then raise exception 'Episode not found'; end if;
  if not public.can_edit_creator_project(target_project) then
    raise exception 'You do not have permission to change this project';
  end if;
  if jsonb_typeof(p_prompts) <> 'array' then raise exception 'Prompts must be a list'; end if;

  delete from public.creator_script_prompts where episode_id = p_episode_id;

  insert into public.creator_script_prompts (project_id, episode_id, order_index, title, prompt, entity_names, notes)
  select
    target_project,
    p_episode_id,
    coalesce((item->>'orderIndex')::integer, (row_number() over ())::integer - 1),
    coalesce(item->>'title', ''),
    item->>'prompt',
    coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(
        case when jsonb_typeof(item->'entityNames') = 'array' then item->'entityNames' else '[]'::jsonb end
      ) as value),
      '{}'
    ),
    coalesce(item->>'notes', '')
  from jsonb_array_elements(p_prompts) as item
  where coalesce(item->>'prompt', '') <> '';

  get diagnostics saved = row_count;
  return saved;
end;
$$;

grant execute on function public.save_script_prompt_sheet(uuid, jsonb) to authenticated;
