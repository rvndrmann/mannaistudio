-- Keep generation history addressable by episode and repair image records that
-- older Director runs saved only in chat media after an insert used this missing
-- column. The shot's keyframe remains a pointer; every output remains a row.
alter table public.creator_generation_jobs
  add column if not exists episode_id uuid references public.creator_episodes(id) on delete set null;

create index if not exists creator_generation_jobs_episode_idx
  on public.creator_generation_jobs(episode_id, created_at desc);

with image_messages as (
  select
    m.id as message_id,
    m.session_id,
    m.created_at,
    s.episode_id,
    e.project_id,
    p.user_id,
    ((regexp_match(m.content, 'storyboard shot ([0-9]+)', 'i'))[1])::integer as shot_number,
    media.item
  from public.creator_chat_messages m
  join public.creator_chat_sessions s on s.id = m.session_id
  join public.creator_episodes e on e.id = s.episode_id
  join public.creator_projects p on p.id = e.project_id
  cross join lateral jsonb_array_elements(coalesce(m.media, '[]'::jsonb)) media(item)
  where m.role = 'assistant'
    and m.content ~* 'attached it to storyboard shot [0-9]+'
    and media.item->>'type' = 'image'
    and nullif(media.item->>'path', '') is not null
), recovered as (
  select image_messages.*, sh.id as shot_id
  from image_messages
  join public.creator_shots sh
    on sh.episode_id = image_messages.episode_id
   and sh.order_index = image_messages.shot_number - 1
)
insert into public.creator_generation_jobs (
  user_id, project_id, episode_id, session_id, message_id, shot_id,
  type, status, model, provider, prompt, input_images, result_url,
  requires_approval, estimated_credits, credits_used, completed_at, created_at
)
select
  user_id, project_id, episode_id, session_id, message_id, shot_id,
  'image'::public.creator_job_type,
  'completed'::public.creator_job_status,
  coalesce(nullif(item->>'model', ''), 'unknown'),
  coalesce(nullif(item->>'provider', ''), 'unknown'),
  coalesce(item->>'prompt', ''),
  '{}'::text[],
  item->>'path',
  false, 0, 0, created_at, created_at
from recovered
where not exists (
  select 1 from public.creator_generation_jobs job
  where job.result_url = recovered.item->>'path'
);
