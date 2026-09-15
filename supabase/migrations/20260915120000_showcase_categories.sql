-- The showcase reel learns what kind of ad each video is.
--
-- `showcase_items` has curated the homepage since the first week: an admin
-- uploads a video and a thumbnail and it appears. That is still the whole
-- system — this adds four optional facts to each row so the homepage can sort
-- a reel, lead with the best work, filter by format, and say whose brand it
-- was made for.
--
-- Every column has a default, so every row that exists keeps working and every
-- insert the admin panel already makes keeps working. Nothing here is required
-- to show a video; the homepage falls back to the order the rows were created
-- in, which is what it did before.

alter table public.showcase_items
  -- Deliberately free text with an app-side list rather than a check
  -- constraint: the categories are a marketing decision, and a new one should
  -- not need a migration to appear in a dropdown.
  add column if not exists category text not null default 'other',
  -- Whose ad it was. Shown under the video when set, omitted when not — an
  -- empty string reads as "no client named", never as a missing value.
  add column if not exists brand text not null default '',
  -- Ascending, lowest first. Ties fall back to newest-first, which is exactly
  -- the order the reel used before this column existed.
  add column if not exists position integer not null default 0,
  -- The reel leads with these. Not a visibility switch: an item that is not
  -- featured still appears, so turning the flag on for one video can never
  -- make another disappear.
  add column if not exists is_featured boolean not null default false;

create index if not exists showcase_items_reel_idx
  on public.showcase_items (is_featured desc, position, created_at desc);

create index if not exists showcase_items_category_idx
  on public.showcase_items (category);
