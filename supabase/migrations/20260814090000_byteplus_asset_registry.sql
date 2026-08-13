-- The BytePlus Asset Library holds 50 images for the whole account, and every
-- generation was registering its references again: the same character, the same
-- keyframe, a fresh asset each time — including for requests the provider went
-- on to reject. The quota filled in hours and no record survived of what was in
-- it, so nothing could be cleaned up on purpose.
--
-- This is that record. One row per registered image, keyed by the storage path,
-- so a path registers once and is reused everywhere after.

create table if not exists public.creator_byteplus_assets (
  id uuid primary key default gen_random_uuid(),
  -- The studio storage path, or the external URL for a reference that has no
  -- path of its own. Unique: that is what makes the reuse work.
  source_path text not null unique,
  asset_id text not null,
  asset_uri text not null,
  name text,
  -- Where it came from, so an unused asset can be recognised as such.
  project_id uuid references public.creator_projects(id) on delete set null,
  entity_id uuid references public.creator_entities(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  use_count integer not null default 1
);

create index if not exists creator_byteplus_assets_last_used_idx
  on public.creator_byteplus_assets(last_used_at desc);

alter table public.creator_byteplus_assets enable row level security;

-- The library is one shared account resource, so every signed-in user reads the
-- same registry and the server reuses whatever is already there.
drop policy if exists "byteplus assets read" on public.creator_byteplus_assets;
create policy "byteplus assets read" on public.creator_byteplus_assets
  for select using (auth.role() = 'authenticated');

drop policy if exists "byteplus assets insert" on public.creator_byteplus_assets;
create policy "byteplus assets insert" on public.creator_byteplus_assets
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "byteplus assets touch" on public.creator_byteplus_assets;
create policy "byteplus assets touch" on public.creator_byteplus_assets
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Deletion frees a slot in a shared quota, so it stays with admins.
drop policy if exists "byteplus assets admin delete" on public.creator_byteplus_assets;
create policy "byteplus assets admin delete" on public.creator_byteplus_assets
  for delete using (exists (select 1 from public.admin_users where id = auth.uid()));
