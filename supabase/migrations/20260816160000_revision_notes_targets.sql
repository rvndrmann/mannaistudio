-- Revision notes stop being a shot-only feature.
--
-- A client reviewing a delivered cut does not only have notes about frame 12.
-- They have notes about a character's face across every shot it appears in, and
-- notes about the edit as a whole. Those had nowhere to go, so they were being
-- written on whichever shot happened to be open, which is where nobody looks
-- for them afterwards.
--
-- One table still, with one nullable target: a note names a shot, or names an
-- entity, or names neither and belongs to the project. The table keeps its
-- original name because renaming it would break every policy and index that
-- already points at it for no gain the reader can see.

alter table public.creator_shot_comments
  alter column shot_id drop not null;

alter table public.creator_shot_comments
  add column if not exists entity_id uuid references public.creator_entities(id) on delete cascade;

-- A note about a shot and a note about a character are different notes. Allowing
-- both columns at once would make "which thread is this in" a question with two
-- answers, and the listing would show it twice.
alter table public.creator_shot_comments
  drop constraint if exists creator_shot_comments_one_target;
alter table public.creator_shot_comments
  add constraint creator_shot_comments_one_target check (
    (shot_id is not null and entity_id is null)
    or (shot_id is null and entity_id is not null)
    or (shot_id is null and entity_id is null)
  );

create index if not exists creator_shot_comments_entity_idx
  on public.creator_shot_comments (entity_id, created_at)
  where entity_id is not null;

-- The project-wide thread is the one read most often — it is the first thing
-- open when a client sits down with a delivered cut — and it is the one with no
-- target column to index on.
create index if not exists creator_shot_comments_project_scope_idx
  on public.creator_shot_comments (project_id, created_at)
  where shot_id is null and entity_id is null;

comment on table public.creator_shot_comments is
  'Revision notes shared by an enterprise client and the producing team. A note targets a shot, an entity, or the project itself when both target columns are null.';
