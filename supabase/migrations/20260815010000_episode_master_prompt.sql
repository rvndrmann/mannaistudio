-- The master prompt: one document per episode, written from the script, that
-- every other prompt in the production is extracted from.
--
-- Characters, keyframe prompts, and video prompts were each written from the
-- script independently, so nothing held them to one another and they drifted.
-- Deriving all three from a single document is what keeps a character's look,
-- a shot's framing, and a clip's motion describing the same scene.
--
-- Stored unsanitised, unlike every prompt downstream of it: the master prompt
-- is the one place a CHARACTER / ASSET LOCK block belongs, because that block
-- is what the entities are created from. It must never travel into a shot's
-- image or video prompt, where written appearance overrides reference art and
-- makes a face change between shots.
alter table public.creator_episodes
  add column if not exists master_prompt text,
  add column if not exists master_prompt_updated_at timestamptz;

comment on column public.creator_episodes.master_prompt is
  'The episode''s master scene prompt. Source of truth for extracting entities, shot image prompts, and shot video prompts. Never sent to a generation provider as-is.';
