-- Proof: the showcase table learns to hold reviews and sales as well as work.
--
-- `showcase_items` has always been the admin's pick of videos for the homepage.
-- The homepage now needs two more kinds of evidence — what students say and
-- what clients paid — and all three are the same thing to manage: a card with
-- media on it that an admin orders, features and publishes. So this extends the
-- table that already exists rather than standing a second one beside it.
--
-- Four of the brief's fields are columns this table already had under other
-- names, and are reused rather than duplicated:
--
--   poster_image -> thumbnail      featured   -> is_featured
--   video        -> video_url      sort_order -> position
--
-- Two rules are enforced here and not only in the admin form, because the form
-- is not the only thing that can write a row:
--
--   Nothing is published without consent on record.
--   Nothing with a video is published without a poster, so a card can never be
--   a black rectangle waiting for a file to load.

alter table public.showcase_items
  add column if not exists type text not null default 'portfolio',
  add column if not exists person_name text not null default '',
  add column if not exists person_role text not null default '',
  add column if not exists avatar_image text not null default '',
  add column if not exists quote text not null default '',
  -- [{ "url": "...", "thumb": "..." }], six at most.
  add column if not exists screenshots jsonb not null default '[]'::jsonb,
  add column if not exists amount numeric,
  add column if not exists currency text,
  add column if not exists proof_date date,
  add column if not exists consent_confirmed boolean not null default false,
  -- A draft until someone says otherwise.
  add column if not exists published boolean not null default false,
  -- Soft delete: the row and its files stay, it just stops being listed.
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.showcase_items
  drop constraint if exists showcase_items_type_check,
  drop constraint if exists showcase_items_currency_check,
  drop constraint if exists showcase_items_screenshots_check,
  drop constraint if exists showcase_items_publish_guard;

-- What was on the homepage before this migration stays on it, with the poster
-- each video was missing. Runs before the guard below is added, so the guard is
-- validated against rows that already satisfy it.
--
-- Consent is recorded as given for these because they are the studio's own
-- portfolio pieces and were already public; none of them names a person.
update public.showcase_items as s
set title = v.title,
    category = v.category,
    position = v.position,
    thumbnail = 'https://cytkucdnllicnmljixwd.supabase.co/storage/v1/object/public/showcase-videos/posters/' || s.id || '.webp',
    description = case when s.description = 'Describe this featured work...' then '' else s.description end,
    consent_confirmed = true,
    published = true
from (values
  ('87bbe86e-01e8-402f-b5da-bbdc446f696c'::uuid, 'Skincare UGC ad',               'ugc',     0),
  ('1f671c37-2353-4be4-b0c3-b38a1dc1585c'::uuid, 'Beauty brand UGC ad',           'beauty',  1),
  ('b4cd2c9d-c0e8-45c3-93f4-4e3ef26c6e09'::uuid, 'One-shot product ad · 15 sec',  'product', 2),
  ('c82e10b7-085d-4d72-9cc8-7935212a3e92'::uuid, 'Sneaker product ad',            'fashion', 3),
  ('ec3bc889-a6ec-4a79-8ee2-cbaccd3329ad'::uuid, 'Sandal product film',           'fashion', 4),
  ('7adb556c-4ef9-46f9-bc6f-d1724fcf32c2'::uuid, 'Underwater party drink spot',   'product', 5),
  ('ee9c1a8c-c9cd-48a6-99ce-bc6980213820'::uuid, 'Border Run — short film scene', 'film',    6)
) as v(id, title, category, position)
where s.id = v.id;

-- The series episodes are no longer part of what the homepage sells. Kept as
-- drafts rather than deleted: the files are still theirs to republish.
update public.showcase_items
set published = false,
    is_featured = false,
    category = 'film',
    description = case when description = 'Describe this featured work...' then '' else description end
where title ilike '%she came back%';

alter table public.showcase_items
  add constraint showcase_items_type_check
    check (type in ('student_review', 'sale_proof', 'portfolio')),
  add constraint showcase_items_currency_check
    check (currency is null or currency in ('INR', 'USD')),
  add constraint showcase_items_screenshots_check
    check (jsonb_typeof(screenshots) = 'array' and jsonb_array_length(screenshots) <= 6),
  add constraint showcase_items_publish_guard
    check (
      not published
      or (
        consent_confirmed
        and deleted_at is null
        and (video_url is null or video_url = '' or coalesce(thumbnail, '') <> '')
      )
    );

create index if not exists showcase_items_proof_idx
  on public.showcase_items (type, position, created_at desc)
  where published and deleted_at is null;

create or replace function public.showcase_items_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists showcase_items_touch on public.showcase_items;
create trigger showcase_items_touch
  before update on public.showcase_items
  for each row execute function public.showcase_items_touch();

-- The table was readable in full by anyone. That was harmless while every row
-- was meant for the homepage; it is not once the table holds drafts, and
-- screenshots someone has not yet agreed to show.
drop policy if exists "showcase items are publicly readable" on public.showcase_items;
drop policy if exists "published showcase items are publicly readable" on public.showcase_items;
create policy "published showcase items are publicly readable"
  on public.showcase_items for select
  using (
    (published and deleted_at is null)
    or exists (select 1 from public.admin_users where admin_users.id = auth.uid())
  );

-- Drag-to-reorder saves the whole order in one call: the position of each row
-- is its place in the array.
create or replace function public.admin_reorder_proof_items(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception 'Admin access required';
  end if;

  update public.showcase_items as s
  set position = o.ord - 1
  from unnest(p_ids) with ordinality as o(id, ord)
  where s.id = o.id;
end;
$$;

revoke execute on function public.admin_reorder_proof_items(uuid[]) from public, anon;
grant execute on function public.admin_reorder_proof_items(uuid[]) to authenticated, service_role;

-- The handful of homepage facts that are the admin's to state and not the
-- code's: what generation costs, where the key setup guide lives, and which
-- optional blocks are switched on. Empty means hidden, everywhere.
create or replace function public.admin_set_proof_page_settings(p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value jsonb;
  v_price numeric;
begin
  if not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception 'Admin access required';
  end if;

  v_price := case
    when coalesce(p_value->>'annual_price', '') ~ '^\d+(\.\d+)?$' then (p_value->>'annual_price')::numeric
    else null
  end;

  v_value := jsonb_build_object(
    'cost_example', left(trim(coalesce(p_value->>'cost_example', '')), 400),
    'api_guide_url', left(trim(coalesce(p_value->>'api_guide_url', '')), 500),
    'show_community_reason', coalesce((p_value->>'show_community_reason')::boolean, false),
    'show_annual_plan', coalesce((p_value->>'show_annual_plan')::boolean, false),
    'annual_price', v_price,
    'studio_demo_url', left(trim(coalesce(p_value->>'studio_demo_url', '')), 500),
    'studio_demo_poster', left(trim(coalesce(p_value->>'studio_demo_poster', '')), 500)
  );

  insert into public.site_settings (key, value, updated_at)
  values ('proof_page', v_value, now())
  on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

  return v_value;
end;
$$;

revoke execute on function public.admin_set_proof_page_settings(jsonb) from public, anon;
grant execute on function public.admin_set_proof_page_settings(jsonb) to authenticated, service_role;

-- Course cards. "0 Hours" is the admin form's default and was never a length;
-- the mini course is one 12-minute lesson, and the crash course has a lesson
-- hosted where its length cannot be read, so its card says how many lessons it
-- has until someone enters the real figure.
update public.courses set duration = '12 min'
where id = 'course-1786928974415' and duration = '0 Hours';

update public.courses set duration = ''
where duration = '0 Hours';

update public.courses
set description = 'Go from idea to a finished cinematic AI scene in 1 hour. Includes the Seedance Prompt Agent and Script Agent.'
where id = 'course-1779736402069';
