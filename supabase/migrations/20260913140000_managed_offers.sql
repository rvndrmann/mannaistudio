-- The Hire Us catalogue becomes editable.
--
-- The four services and their packages were a constant in
-- `src/lib/managed-production.ts`, which meant changing a price was a deploy
-- and adding a service was a code change. They move here, shaped like a Fiverr
-- gig: a service is the card that sells, with a thumbnail and a promo video,
-- and its packages are the price tiers underneath it.
--
-- The rule that money is priced by the server does not change — it just reads
-- the price from this table instead of from a constant. Nothing about the
-- catalogue is ever taken from the browser.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. The gig, and its tiers
-- ---------------------------------------------------------------------------

create table if not exists public.managed_offer_services (
  id uuid primary key default gen_random_uuid(),
  -- Stable across renames, because it is what a placed order records as the
  -- thing that was bought. Renaming "UGC Ads" must not orphan last month's
  -- orders, so the name is free to change and the key is not.
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{1,58}$'),
  name text not null,
  tagline text not null default '',
  description text not null default '',
  cta text not null default 'Start Project',

  -- Public URLs, not storage paths: this is a marketing page open to strangers,
  -- and a signed URL that expires is a card with a dead image on it. Both
  -- buckets are already public-read, admin-write.
  thumbnail_url text not null default '',
  video_url text not null default '',

  deliverables text[] not null default '{}',
  -- The creative-direction options the brief offers for this service.
  styles text[] not null default '{}',

  -- Sold as a conversation rather than a package — no checkout, the client's
  -- brief opens a proposal request instead.
  quote_only boolean not null default false,
  is_published boolean not null default true,
  position integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists managed_offer_services_order_idx
  on public.managed_offer_services (position, created_at);

create table if not exists public.managed_offer_packages (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.managed_offer_services(id) on delete cascade,
  -- Unique across every service, not just within one: a placed order stores the
  -- package key alone, and two services sharing "starter" would make an old
  -- order ambiguous about what was sold.
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{1,58}$'),
  name text not null,
  summary text not null default '',

  video_count integer not null default 1 check (video_count between 1 and 50),
  duration_seconds integer not null default 30 check (duration_seconds between 5 and 600),
  revisions integer not null default 2 check (revisions between 0 and 20),
  price_inr integer not null default 0 check (price_inr >= 0),

  includes text[] not null default '{}',
  popular boolean not null default false,
  is_published boolean not null default true,
  position integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists managed_offer_packages_service_idx
  on public.managed_offer_packages (service_id, position, created_at);

drop trigger if exists managed_offer_services_updated on public.managed_offer_services;
create trigger managed_offer_services_updated before update on public.managed_offer_services
  for each row execute function public.creator_touch_updated_at();
drop trigger if exists managed_offer_packages_updated on public.managed_offer_packages;
create trigger managed_offer_packages_updated before update on public.managed_offer_packages
  for each row execute function public.creator_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. What an order remembers about what it bought
--
-- The service_type check listed the four hardcoded keys, which would refuse an
-- order for any service an admin creates from now on. It goes, and the column
-- stays plain text: it is a historical record of the key that was sold, not a
-- live pointer. Deliberately no foreign key either — deleting a retired gig
-- must not be blocked by, or cascade into, the orders that were placed under
-- it.
-- ---------------------------------------------------------------------------

alter table public.managed_projects
  drop constraint if exists managed_projects_service_type_check;

alter table public.managed_projects
  add column if not exists offer_snapshot jsonb not null default '{}'::jsonb;

comment on column public.managed_projects.offer_snapshot is
  'The gig and package as they read at the moment of sale. Editing the catalogue later must never rewrite what someone was told they were buying.';

-- ---------------------------------------------------------------------------
-- 3. Reading is public; writing is admin-only, through functions
-- ---------------------------------------------------------------------------

alter table public.managed_offer_services enable row level security;
alter table public.managed_offer_packages enable row level security;

-- Anonymous read, because /hire-us is a shop window: a stranger has to be able
-- to see what is for sale before being asked who they are. Unpublished rows are
-- a draft and stay out of it, except for the admin working on them.
drop policy if exists "managed offer services read" on public.managed_offer_services;
create policy "managed offer services read" on public.managed_offer_services for select
  to anon, authenticated
  using (is_published or public.is_site_admin());

drop policy if exists "managed offer packages read" on public.managed_offer_packages;
create policy "managed offer packages read" on public.managed_offer_packages for select
  to anon, authenticated
  using (
    public.is_site_admin()
    or (is_published and exists (
      select 1 from public.managed_offer_services s
      where s.id = service_id and s.is_published
    ))
  );

create or replace function public.admin_upsert_managed_service(
  p_id uuid,
  p_key text,
  p_name text,
  p_tagline text default '',
  p_description text default '',
  p_cta text default 'Start Project',
  p_thumbnail_url text default '',
  p_video_url text default '',
  p_deliverables text[] default '{}',
  p_styles text[] default '{}',
  p_quote_only boolean default false,
  p_is_published boolean default true,
  p_position integer default null
)
returns public.managed_offer_services
language plpgsql security definer set search_path = public as $$
declare
  row_out public.managed_offer_services;
  v_key text := lower(btrim(coalesce(p_key, '')));
  v_next integer;
begin
  if not public.is_site_admin() then raise exception 'Only admins can change the catalogue'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'A service needs a name'; end if;

  if p_id is null then
    if v_key = '' then raise exception 'A service needs a key'; end if;
    select coalesce(max(position), 0) + 1 into v_next from public.managed_offer_services;
    insert into public.managed_offer_services (
      key, name, tagline, description, cta, thumbnail_url, video_url,
      deliverables, styles, quote_only, is_published, position
    ) values (
      v_key, btrim(p_name), coalesce(p_tagline, ''), coalesce(p_description, ''),
      coalesce(nullif(btrim(p_cta), ''), 'Start Project'),
      coalesce(p_thumbnail_url, ''), coalesce(p_video_url, ''),
      coalesce(p_deliverables, '{}'), coalesce(p_styles, '{}'),
      coalesce(p_quote_only, false), coalesce(p_is_published, true),
      coalesce(p_position, v_next)
    )
    returning * into row_out;
  else
    -- The key is deliberately not updatable. Orders record it, and rewriting it
    -- would silently detach every order ever placed under this service.
    update public.managed_offer_services set
      name = btrim(p_name),
      tagline = coalesce(p_tagline, tagline),
      description = coalesce(p_description, description),
      cta = coalesce(nullif(btrim(p_cta), ''), cta),
      thumbnail_url = coalesce(p_thumbnail_url, thumbnail_url),
      video_url = coalesce(p_video_url, video_url),
      deliverables = coalesce(p_deliverables, deliverables),
      styles = coalesce(p_styles, styles),
      quote_only = coalesce(p_quote_only, quote_only),
      is_published = coalesce(p_is_published, is_published),
      position = coalesce(p_position, position)
    where id = p_id
    returning * into row_out;
    if row_out.id is null then raise exception 'Service not found'; end if;
  end if;

  return row_out;
end;
$$;

create or replace function public.admin_upsert_managed_package(
  p_id uuid,
  p_service_id uuid,
  p_key text,
  p_name text,
  p_summary text default '',
  p_video_count integer default 1,
  p_duration_seconds integer default 30,
  p_revisions integer default 2,
  p_price_inr integer default 0,
  p_includes text[] default '{}',
  p_popular boolean default false,
  p_is_published boolean default true,
  p_position integer default null
)
returns public.managed_offer_packages
language plpgsql security definer set search_path = public as $$
declare
  row_out public.managed_offer_packages;
  v_key text := lower(btrim(coalesce(p_key, '')));
  v_next integer;
begin
  if not public.is_site_admin() then raise exception 'Only admins can change the catalogue'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'A package needs a name'; end if;

  if p_id is null then
    if v_key = '' then raise exception 'A package needs a key'; end if;
    if p_service_id is null then raise exception 'A package belongs to a service'; end if;
    select coalesce(max(position), 0) + 1 into v_next
    from public.managed_offer_packages where service_id = p_service_id;
    insert into public.managed_offer_packages (
      service_id, key, name, summary, video_count, duration_seconds, revisions,
      price_inr, includes, popular, is_published, position
    ) values (
      p_service_id, v_key, btrim(p_name), coalesce(p_summary, ''),
      coalesce(p_video_count, 1), coalesce(p_duration_seconds, 30), coalesce(p_revisions, 2),
      greatest(coalesce(p_price_inr, 0), 0), coalesce(p_includes, '{}'),
      coalesce(p_popular, false), coalesce(p_is_published, true), coalesce(p_position, v_next)
    )
    returning * into row_out;
  else
    update public.managed_offer_packages set
      name = btrim(p_name),
      summary = coalesce(p_summary, summary),
      video_count = coalesce(p_video_count, video_count),
      duration_seconds = coalesce(p_duration_seconds, duration_seconds),
      revisions = coalesce(p_revisions, revisions),
      price_inr = greatest(coalesce(p_price_inr, price_inr), 0),
      includes = coalesce(p_includes, includes),
      popular = coalesce(p_popular, popular),
      is_published = coalesce(p_is_published, is_published),
      position = coalesce(p_position, position)
    where id = p_id
    returning * into row_out;
    if row_out.id is null then raise exception 'Package not found'; end if;
  end if;

  -- One "Most picked" per service. Two badges is no badge.
  if row_out.popular then
    update public.managed_offer_packages
    set popular = false
    where service_id = row_out.service_id and id <> row_out.id and popular;
  end if;

  return row_out;
end;
$$;

create or replace function public.admin_delete_managed_service(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_site_admin() then raise exception 'Only admins can change the catalogue'; end if;
  delete from public.managed_offer_services where id = p_id;
  return found;
end;
$$;

create or replace function public.admin_delete_managed_package(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_site_admin() then raise exception 'Only admins can change the catalogue'; end if;
  delete from public.managed_offer_packages where id = p_id;
  return found;
end;
$$;

grant execute on function public.admin_upsert_managed_service(uuid, text, text, text, text, text, text, text, text[], text[], boolean, boolean, integer) to authenticated;
grant execute on function public.admin_upsert_managed_package(uuid, uuid, text, text, text, integer, integer, integer, integer, text[], boolean, boolean, integer) to authenticated;
grant execute on function public.admin_delete_managed_service(uuid) to authenticated;
grant execute on function public.admin_delete_managed_package(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Seed: the catalogue exactly as it shipped
--
-- Same keys, same prices, same copy — so this migration changes where the
-- catalogue lives and nothing about what anyone is charged. `on conflict do
-- nothing` so re-running it never overwrites an edit an admin has since made.
-- ---------------------------------------------------------------------------

insert into public.managed_offer_services
  (key, name, tagline, description, cta, deliverables, styles, quote_only, position)
values
  ('ugc', 'UGC Ads', 'Creator-style ads that look native to the feed',
   'Testimonial, problem/solution and social-native ads made to look like a real person filmed them — not like an ad.',
   'Start UGC Project',
   array['15-second UGC ad','30-second UGC ad','60-second UGC ad','Multiple hooks and variations'],
   array['Creator testimonial','Problem → Solution','Product demo','Founder-style','Storytime','Review','Before / after','TikTok / Reels native','AI avatar creator','Custom'],
   false, 1),
  ('direct_response', 'Direct Response Ads', 'Performance ads built around hook, problem, proof and offer',
   'Written to sell: a hook that stops the scroll, the problem stated plainly, the benefit, the proof, the offer, the call to action.',
   'Create Video Ads',
   array['Hook-led performance ads','Offer and CTA variations','Platform-native cuts'],
   array['Aggressive performance ad','Educational','Emotional','Comparison','Product demonstration','Offer-led','Social proof','Cinematic performance ad'],
   false, 2),
  ('cinematic', 'Cinematic Product Ads', 'Commercials and brand films with real production value',
   'Higher-craft product commercials — lighting, camera movement, grade and sound designed rather than assembled.',
   'Create Cinematic Ad',
   array['30-second product commercial','60-second brand film','Hero product sequences'],
   array['Product hero film','Brand film','Lifestyle narrative','Macro / texture led','Launch teaser','Luxury / editorial','Custom'],
   false, 3),
  ('micro_drama', 'Branded Micro-Drama', 'Serialised story where the product lives inside the plot',
   'Episodic story-led content built the way our Originals are, with your product integrated into the drama rather than announced after it.',
   'Request Proposal',
   array['Serialised episodes','Recurring cast and world','Product integrated into the story'],
   array['Romance / relationship drama','Revenge / redemption','Workplace drama','Thriller','Comedy','Slice of life','Custom'],
   true, 4)
on conflict (key) do nothing;

insert into public.managed_offer_packages
  (service_id, key, name, summary, video_count, duration_seconds, revisions, price_inr, includes, popular, position)
select s.id, v.key, v.name, v.summary, v.video_count, v.duration_seconds, v.revisions, v.price_inr, v.includes, v.popular, v.position
from (values
  ('ugc', 'ugc_starter', 'UGC Starter', '1 × 30-second video', 1, 30, 2, 7999,
    array['Script + creative direction','AI production and editing','2 revisions','One aspect ratio'], false, 1),
  ('ugc', 'ugc_pack', 'UGC Ad Pack', '3 × 30-second videos', 3, 30, 2, 19999,
    array['3 distinct hooks','Script + creative direction','AI production and editing','2 revisions per video'], true, 2),
  ('ugc', 'ugc_testing', 'UGC Testing Set', '6 × 30-second videos', 6, 30, 2, 34999,
    array['6 hooks built to be tested against each other','Script + creative direction','2 revisions per video'], false, 3),
  ('direct_response', 'dr_single', 'Single Ad', '1 × 30-second direct response ad', 1, 30, 2, 11999,
    array['Direct response script','AI production and editing','2 revisions'], false, 1),
  ('direct_response', 'dr_campaign', 'Campaign Pack', '3 × 30-second ads with different angles', 3, 30, 2, 27999,
    array['3 angles: problem, proof, offer','Direct response scripts','2 revisions per video'], true, 2),
  ('direct_response', 'dr_scale', 'Scale Pack', '5 × 45-second ads', 5, 45, 2, 49999,
    array['5 ads built for continuous testing','Direct response scripts','2 revisions per video'], false, 3),
  ('cinematic', 'cine_spot', 'Cinematic Spot', '1 × 30-second cinematic ad', 1, 30, 2, 24999,
    array['Creative direction and shot design','Cinematic AI production','Sound design','2 revisions'], true, 1),
  ('cinematic', 'cine_film', 'Brand Film', '1 × 60-second brand film', 1, 60, 2, 44999,
    array['Concept and script','Cinematic AI production','Sound design and grade','2 revisions'], false, 2),
  ('cinematic', 'cine_launch', 'Launch Set', '1 × 60-second film + 2 × 15-second cutdowns', 3, 60, 2, 64999,
    array['Hero film plus two social cutdowns','Concept and script','Sound design and grade','2 revisions each'], false, 3)
) as v(service_key, key, name, summary, video_count, duration_seconds, revisions, price_inr, includes, popular, position)
join public.managed_offer_services s on s.key = v.service_key
on conflict (key) do nothing;

-- Backfill what the orders already placed were sold under, so a project opened
-- tomorrow still names its service correctly after the catalogue is edited.
update public.managed_projects mp
set offer_snapshot = jsonb_build_object(
  'serviceKey', mp.service_type,
  'serviceName', coalesce((select s.name from public.managed_offer_services s where s.key = mp.service_type), mp.service_type),
  'packageKey', mp.package_key,
  'packageName', coalesce((select p.name from public.managed_offer_packages p where p.key = mp.package_key), ''),
  'packageSummary', coalesce((select p.summary from public.managed_offer_packages p where p.key = mp.package_key), '')
)
where mp.offer_snapshot = '{}'::jsonb;
