-- What the brand's own website says, read once and kept.
--
-- The strategist was asking brands to describe products already written on
-- their home page. Storing the read rather than fetching it per turn keeps the
-- agents fast, keeps the site's own words in front of them, and makes a stale
-- snapshot visible instead of quietly wrong.

alter table public.creator_brands
  add column if not exists website_snapshot text not null default '',
  -- The pages that were read, so the panel can show what the agents actually saw.
  add column if not exists website_pages jsonb not null default '[]'::jsonb,
  add column if not exists website_fetched_at timestamptz,
  add column if not exists website_error text not null default '';
