-- The episode's edited cut, exported from the Timeline (the embedded OpenReel
-- editor) and uploaded to creator-studio-media under
-- {user_id}/{project_id}/final-cuts/{episode_id}/.
--
-- Points at the latest export only. Earlier exports stay in storage: a cut may
-- already have been handed to a client, and nothing here should make that
-- file disappear.
alter table public.creator_episodes
  add column if not exists final_cut jsonb;

comment on column public.creator_episodes.final_cut is
  'Latest exported edit: {path, filename, duration_seconds, size_bytes, saved_at, saved_by}. Written by the workspace saveFinalCut action.';
