-- Adds last_verified_at column to creator_byteplus_assets so asset registration
-- records when an asset was last verified with BytePlus.

alter table public.creator_byteplus_assets
  add column if not exists last_verified_at timestamptz default now();
