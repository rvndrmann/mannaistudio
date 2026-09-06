-- "Notify me when episode N lands."
--
-- A viewer who finishes the last free episode of a series that is still being
-- written has nowhere to go: the grid simply stops. That viewer is the most
-- engaged person on the page and the app currently loses them silently.
--
-- Two pieces make the ask possible. `planned_episodes` on the series says how
-- long the season will eventually be, so the grid can draw the unreleased
-- numbers as "coming soon" instead of ending abruptly. And
-- `originals_notify_requests` records who asked to hear about which of those
-- numbers, with the address to reach them at.
--
-- The request table deliberately allows a signed-out viewer (`profile_id` null,
-- email given). Asking someone to create an account before they may be told
-- about an episode loses exactly the people this feature exists to keep.

-- ---------------------------------------------------------------------------
-- 1. How long the season is meant to be.
-- ---------------------------------------------------------------------------
-- Null means "we are not saying" — the grid then shows only what exists, which
-- is the behaviour every series had before this migration.

alter table public.originals_series
    add column if not exists planned_episodes int
        check (planned_episodes is null or planned_episodes > 0);

comment on column public.originals_series.planned_episodes is
    'Total episodes the finished season will have. Numbers above what is published render as coming soon.';

-- ---------------------------------------------------------------------------
-- 2. The waiting list.
-- ---------------------------------------------------------------------------

create table if not exists public.originals_notify_requests (
    id uuid primary key default gen_random_uuid(),
    series_id uuid not null references public.originals_series(id) on delete cascade,
    -- The episode being waited on, by number rather than by id: the row it
    -- refers to does not exist yet.
    episode_number int not null check (episode_number > 0),
    -- Null for a viewer who never signed in.
    profile_id uuid references public.profiles(id) on delete set null,
    email text,
    phone text,
    -- Stamped when the announcement actually goes out, so a second upload of a
    -- later episode does not mail the same person about this one again.
    notified_at timestamptz,
    created_at timestamptz not null default now(),
    -- At least one way to reach them, or the row is not worth keeping.
    check (coalesce(btrim(email), '') <> '' or coalesce(btrim(phone), '') <> '')
);

-- One ask per person per episode. Two partial indexes rather than one
-- constraint because a signed-out viewer has no profile_id to key on, and
-- NULLs do not collide in a unique index.
create unique index if not exists originals_notify_profile_unique
    on public.originals_notify_requests (series_id, episode_number, profile_id)
    where profile_id is not null;

create unique index if not exists originals_notify_email_unique
    on public.originals_notify_requests (series_id, episode_number, lower(btrim(email)))
    where profile_id is null and email is not null;

create index if not exists originals_notify_pending_idx
    on public.originals_notify_requests (series_id, episode_number)
    where notified_at is null;

alter table public.originals_notify_requests enable row level security;

-- Admins work the list from the dashboard; everyone else goes through the API
-- route below. No viewer-facing SELECT policy: who else is waiting for an
-- episode is not a viewer's business, and the email column makes it a leak.
drop policy if exists "Admins manage originals notify requests" on public.originals_notify_requests;
create policy "Admins manage originals notify requests"
    on public.originals_notify_requests for all
    to authenticated
    using (exists (select 1 from public.admin_users where id = auth.uid()))
    with check (exists (select 1 from public.admin_users where id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Joining the list.
-- ---------------------------------------------------------------------------
-- Security definer so a signed-out viewer can be recorded at all, and so the
-- episode number can be validated against the series' own plan rather than
-- trusted from the browser.

create or replace function public.request_originals_notify(
    p_series_id uuid,
    p_episode_number int,
    p_email text,
    p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_planned int;
    v_published boolean;
    v_email text := nullif(btrim(coalesce(p_email, '')), '');
    v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
    v_id uuid;
begin
    select planned_episodes, is_published
      into v_planned, v_published
      from public.originals_series
     where id = p_series_id;

    if not found or not v_published then
        raise exception 'Series not found';
    end if;
    if v_email is null and v_phone is null then
        raise exception 'An email address or phone number is required';
    end if;
    if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
        raise exception 'That email address does not look right';
    end if;
    -- Waiting for an episode nobody has promised is a typed URL, not a viewer.
    if p_episode_number is null or p_episode_number < 1
       or (v_planned is not null and p_episode_number > v_planned) then
        raise exception 'That episode is not on the schedule';
    end if;
    if exists (
        select 1 from public.originals_episodes
         where series_id = p_series_id
           and episode_number = p_episode_number
           and is_published
    ) then
        raise exception 'That episode is already out';
    end if;

    insert into public.originals_notify_requests (series_id, episode_number, profile_id, email, phone)
    values (p_series_id, p_episode_number, auth.uid(), v_email, v_phone)
    on conflict do nothing
    returning id into v_id;

    -- Asking twice is not an error; it is the same person clicking again.
    if v_id is null then
        select id into v_id
          from public.originals_notify_requests
         where series_id = p_series_id
           and episode_number = p_episode_number
           and (
                (auth.uid() is not null and profile_id = auth.uid())
                or (auth.uid() is null and profile_id is null and lower(btrim(email)) = lower(v_email))
           )
         limit 1;
    end if;

    return v_id;
end;
$$;

revoke execute on function public.request_originals_notify(uuid, int, text, text) from public;
grant execute on function public.request_originals_notify(uuid, int, text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Reading the list as an admin.
-- ---------------------------------------------------------------------------
-- The dashboard wants a name next to each address, and profiles is not
-- readable across accounts, so the join happens in here.

create or replace function public.admin_originals_notify_list(p_series_id uuid default null)
returns table (
    id uuid,
    series_id uuid,
    series_title text,
    episode_number int,
    profile_id uuid,
    full_name text,
    email text,
    phone text,
    notified_at timestamptz,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (select 1 from public.admin_users where id = auth.uid()) then
        raise exception 'Admin access required';
    end if;

    return query
    select r.id,
           r.series_id,
           s.title,
           r.episode_number,
           r.profile_id,
           p.full_name,
           -- A signed-in viewer's account address is the better one to use: it
           -- is the one they actually read.
           coalesce(r.email, p.email),
           r.phone,
           r.notified_at,
           r.created_at
      from public.originals_notify_requests r
      join public.originals_series s on s.id = r.series_id
      left join public.profiles p on p.id = r.profile_id
     where p_series_id is null or r.series_id = p_series_id
     order by r.notified_at nulls first, r.created_at desc;
end;
$$;

revoke execute on function public.admin_originals_notify_list(uuid) from public, anon;
grant execute on function public.admin_originals_notify_list(uuid) to authenticated, service_role;

-- Marking a batch as told. Called after the mail actually goes out, never
-- before — an unsent row that says it was sent is a viewer who never hears back.
create or replace function public.admin_mark_originals_notified(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count int;
begin
    if not exists (select 1 from public.admin_users where id = auth.uid()) then
        raise exception 'Admin access required';
    end if;

    update public.originals_notify_requests
       set notified_at = now()
     where id = any(coalesce(p_ids, '{}'::uuid[]))
       and notified_at is null;

    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

revoke execute on function public.admin_mark_originals_notified(uuid[]) from public, anon;
grant execute on function public.admin_mark_originals_notified(uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Series upsert, now carrying the plan.
-- ---------------------------------------------------------------------------
-- New signature rather than an edit in place: the old one is dropped so a stale
-- client cannot keep calling it and silently wipe planned_episodes on save.

drop function if exists public.admin_upsert_originals_series(uuid, text, text, text, text, text, text, text[], int, int, boolean, int);

create or replace function public.admin_upsert_originals_series(
    p_id uuid,
    p_slug text,
    p_title text,
    p_description text,
    p_poster_url text,
    p_banner_url text,
    p_genre text,
    p_tags text[],
    p_free_episodes int,
    p_episode_price int,
    p_is_published boolean,
    p_sort_order int,
    p_planned_episodes int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid;
begin
    if not exists (select 1 from public.admin_users where id = auth.uid()) then
        raise exception 'Admin access required';
    end if;
    if coalesce(btrim(p_slug), '') = '' or coalesce(btrim(p_title), '') = '' then
        raise exception 'A series needs a slug and a title';
    end if;
    if p_episode_price is null or p_episode_price <= 0 then
        raise exception 'Episode price must be positive';
    end if;
    if p_free_episodes is null or p_free_episodes < 0 then
        raise exception 'Free episode count cannot be negative';
    end if;
    if p_planned_episodes is not null and p_planned_episodes <= 0 then
        raise exception 'Planned episode count must be positive';
    end if;

    insert into public.originals_series as s (
        id, slug, title, description, poster_url, banner_url, genre, tags,
        free_episodes, episode_price, is_published, sort_order, planned_episodes, updated_at
    )
    values (
        coalesce(p_id, gen_random_uuid()), btrim(p_slug), btrim(p_title), p_description,
        p_poster_url, p_banner_url, p_genre, coalesce(p_tags, '{}'),
        p_free_episodes, p_episode_price, coalesce(p_is_published, false), coalesce(p_sort_order, 0),
        p_planned_episodes, now()
    )
    on conflict (id) do update set
        slug = excluded.slug,
        title = excluded.title,
        description = excluded.description,
        poster_url = excluded.poster_url,
        banner_url = excluded.banner_url,
        genre = excluded.genre,
        tags = excluded.tags,
        free_episodes = excluded.free_episodes,
        episode_price = excluded.episode_price,
        is_published = excluded.is_published,
        sort_order = excluded.sort_order,
        planned_episodes = excluded.planned_episodes,
        updated_at = now()
    returning s.id into v_id;

    return v_id;
end;
$$;

revoke execute on function public.admin_upsert_originals_series(uuid, text, text, text, text, text, text, text[], int, int, boolean, int, int) from public, anon;
grant execute on function public.admin_upsert_originals_series(uuid, text, text, text, text, text, text, text[], int, int, boolean, int, int) to authenticated, service_role;
