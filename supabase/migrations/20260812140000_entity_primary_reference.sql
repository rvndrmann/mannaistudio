-- An entity can hold several reference images, but generation may only send one
-- per entity: the reference budget is small, and spending it on three angles of
-- one character drops the rest of the shot's cast before the provider sees it.
-- Until now "the one" was whichever image happened to sort first, which the user
-- could not choose or even see.
--
-- Nullable on purpose: an entity with no explicit choice keeps falling back to
-- the first entry of reference_images, so existing projects behave as before.
alter table public.creator_entities
  add column if not exists primary_reference_image text;

comment on column public.creator_entities.primary_reference_image is
  'Chosen reference image used as this entity''s visual identity during generation. Falls back to reference_images[0] when null.';
