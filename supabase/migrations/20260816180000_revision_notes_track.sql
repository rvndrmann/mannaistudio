-- A shot's still and its clip get their own threads.
--
-- They were sharing one, on the reasoning that "her face is wrong" is the same
-- note wherever you noticed it. That was wrong: the keyframe is frequently
-- exactly right and the clip made from it is not — the framing lands, the motion
-- drifts, the eyes go dead halfway through. Filing both against one thread makes
-- the client write "the image is fine but the video is bad" every time, which is
-- them doing by hand the separation this column does for them.
--
-- Only a shot has two tracks. An asset has one image, and a note on the project
-- is about the cut, so both leave this null.

alter table public.creator_shot_comments
  add column if not exists track text check (track in ('image', 'video'));

alter table public.creator_shot_comments
  drop constraint if exists creator_shot_comments_track_needs_shot;
alter table public.creator_shot_comments
  add constraint creator_shot_comments_track_needs_shot check (
    track is null or shot_id is not null
  );

-- Threads are read one track at a time, so the track belongs in the index that
-- serves that read rather than being filtered out after the fact.
drop index if exists public.creator_shot_comments_shot_idx;
create index if not exists creator_shot_comments_shot_track_idx
  on public.creator_shot_comments (shot_id, track, created_at)
  where shot_id is not null;

-- Notes written before the split were all filed from the image panel, because
-- it was the only panel that had them.
update public.creator_shot_comments
set track = 'image'
where shot_id is not null and track is null;

comment on column public.creator_shot_comments.track is
  'For a shot note: whether it is about the keyframe (image) or the clip (video). Null for asset and project notes, which have only one thread.';
