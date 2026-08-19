-- Reference art for a character, location, or prop, generated the same way a
-- storyboard keyframe is.
--
-- Asset art used to reach the provider down a private path: the chat route
-- charged the user and called the image model itself, with no generation job,
-- no approval card, and nothing in the job history. Shots went the other way —
-- submit_generation writes a job, the card asks first, and the run is auditable.
-- One target column is what lets asset art use the shot path instead of its own.
alter table public.creator_generation_jobs
  add column if not exists entity_id uuid references public.creator_entities(id) on delete set null;

create index if not exists creator_generation_jobs_entity_idx
  on public.creator_generation_jobs(entity_id, created_at desc);
