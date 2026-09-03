-- Originals: episodic series watched with generation credits.
--
-- The shape is the short-drama app one — a series is a column of numbered
-- episodes, the first few are free, and the rest are bought one at a time. What
-- is bought here is an unlock, not a subscription: `originals_unlocks` is the
-- record that this account may watch this episode, forever, and the credit was
-- taken once.
--
-- Watching spends the same `profiles.credits_balance` as generating, through
-- the same `credit_transactions` ledger. One balance is the whole point: a
-- viewer who tops up to finish a series arrives at the studio already holding
-- credits, and a creator's leftover generation credits are worth something on
-- the viewing side.
--
-- Neither content table is readable by `anon` or `authenticated`. `video_url`
-- is the thing being sold, and a SELECT policy that exposed the row would hand
-- it over before the credit was taken — RLS filters rows, not columns. Public
-- listings are served by API routes holding the service key, which choose the
-- columns they return; the playable URL is released only by
-- `unlock_originals_episode` below.

-- ---------------------------------------------------------------------------
-- 1. Series and episodes.
-- ---------------------------------------------------------------------------

create table if not exists public.originals_series (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    title text not null,
    description text,
    -- Portrait artwork, 9:16. The landscape field is for the hero strip.
    poster_url text,
    banner_url text,
    genre text,
    tags text[] not null default '{}',
    -- How many opening episodes play without charge, and what each one after
    -- them costs. Held per series rather than as a global constant so a launch
    -- title can be opened up further without a migration.
    free_episodes int not null default 3 check (free_episodes >= 0),
    episode_price int not null default 20 check (episode_price > 0),
    is_published boolean not null default false,
    sort_order int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.originals_episodes (
    id uuid primary key default gen_random_uuid(),
    series_id uuid not null references public.originals_series(id) on delete cascade,
    episode_number int not null check (episode_number > 0),
    title text not null,
    description text,
    video_url text,
    thumbnail_url text,
    duration_seconds int,
    is_published boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (series_id, episode_number)
);

create index if not exists originals_episodes_series_idx
    on public.originals_episodes (series_id, episode_number);

-- ---------------------------------------------------------------------------
-- 2. Unlocks.
-- ---------------------------------------------------------------------------
-- One row per account per paid episode. The unique constraint is what makes a
-- double-click cost twenty credits once rather than twice.

create table if not exists public.originals_unlocks (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    episode_id uuid not null references public.originals_episodes(id) on delete cascade,
    credits_spent int not null default 0,
    created_at timestamptz not null default now(),
    unique (profile_id, episode_id)
);

create index if not exists originals_unlocks_profile_idx
    on public.originals_unlocks (profile_id);

-- ---------------------------------------------------------------------------
-- 3. RLS.
-- ---------------------------------------------------------------------------

alter table public.originals_series enable row level security;
alter table public.originals_episodes enable row level security;
alter table public.originals_unlocks enable row level security;

-- Admins get the tables directly, because the admin UI edits them directly and
-- an admin seeing `video_url` is not a leak. Everyone else reads through the
-- API routes, which hold the service key and bypass RLS.
drop policy if exists "Admins manage originals series" on public.originals_series;
create policy "Admins manage originals series"
    on public.originals_series for all
    to authenticated
    using (exists (select 1 from public.admin_users where id = auth.uid()))
    with check (exists (select 1 from public.admin_users where id = auth.uid()));

drop policy if exists "Admins manage originals episodes" on public.originals_episodes;
create policy "Admins manage originals episodes"
    on public.originals_episodes for all
    to authenticated
    using (exists (select 1 from public.admin_users where id = auth.uid()))
    with check (exists (select 1 from public.admin_users where id = auth.uid()));

-- A viewer may see what they have bought, and nothing else. No INSERT policy:
-- unlocks are written only by the function below, which is what takes payment.
drop policy if exists "Users read own originals unlocks" on public.originals_unlocks;
create policy "Users read own originals unlocks"
    on public.originals_unlocks for select
    to authenticated
    using (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- 4. Unlocking an episode.
-- ---------------------------------------------------------------------------
-- The single place a viewer's balance is spent on an episode. It decides the
-- price itself from the series row — the caller names an episode and nothing
-- else, so there is no amount in the request for anyone to edit.
--
-- Three outcomes, all of them returning the playable URL:
--   free      — inside the series' free window, nothing charged, nothing recorded
--   owned     — an unlock already exists, nothing charged
--   purchased — balance debited, unlock and ledger row written
--
-- `already_owned` is separate from `charged` so the caller can tell a repeat
-- open from a first purchase without comparing balances.

create or replace function public.unlock_originals_episode(
    p_profile_id uuid,
    p_episode_id uuid
)
returns table (
    status text,
    credits_charged int,
    new_balance int,
    video_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_episode public.originals_episodes%rowtype;
    v_series public.originals_series%rowtype;
    v_balance int;
begin
    if auth.uid() is distinct from p_profile_id and coalesce(auth.role(), '') <> 'service_role' then
        raise exception 'Not authorized to unlock episodes for this account';
    end if;

    select * into v_episode from public.originals_episodes where id = p_episode_id;
    if not found or not v_episode.is_published then
        raise exception 'That episode is not available';
    end if;

    select * into v_series from public.originals_series where id = v_episode.series_id;
    if not found or not v_series.is_published then
        raise exception 'That series is not available';
    end if;

    -- The opening episodes play for anyone signed in. Deliberately not recorded
    -- as an unlock: a free episode is not an entitlement that could later be
    -- mistaken for a purchase if the free window is narrowed.
    if v_episode.episode_number <= v_series.free_episodes then
        select coalesce(credits_balance, 0) into v_balance from public.profiles where id = p_profile_id;
        return query select 'free'::text, 0, coalesce(v_balance, 0), v_episode.video_url;
        return;
    end if;

    -- Lock the profile before the ownership check, so two clicks arriving
    -- together cannot both find no unlock and both charge.
    perform 1 from public.profiles where id = p_profile_id for update;

    if exists (
        select 1 from public.originals_unlocks
        where profile_id = p_profile_id and episode_id = p_episode_id
    ) then
        select coalesce(credits_balance, 0) into v_balance from public.profiles where id = p_profile_id;
        return query select 'owned'::text, 0, coalesce(v_balance, 0), v_episode.video_url;
        return;
    end if;

    select coalesce(credits_balance, 0) into v_balance from public.profiles where id = p_profile_id;
    if v_balance is null then
        raise exception 'No profile found for this account';
    end if;

    if v_balance < v_series.episode_price then
        -- Not an exception: running short is an ordinary thing for the page to
        -- handle, and it needs the balance back to say how short.
        return query select 'insufficient'::text, v_series.episode_price, v_balance, null::text;
        return;
    end if;

    update public.profiles
    set credits_balance = coalesce(credits_balance, 0) - v_series.episode_price
    where id = p_profile_id
    returning credits_balance into v_balance;

    insert into public.originals_unlocks (profile_id, episode_id, credits_spent)
    values (p_profile_id, p_episode_id, v_series.episode_price);

    insert into public.credit_transactions (profile_id, amount, balance_after, type, description, metadata)
    values (
        p_profile_id,
        -v_series.episode_price,
        v_balance,
        'originals',
        format('%s — Episode %s', v_series.title, v_episode.episode_number),
        jsonb_build_object('episode_id', p_episode_id, 'series_id', v_series.id)
    );

    return query select 'purchased'::text, v_series.episode_price, v_balance, v_episode.video_url;
end;
$$;

revoke execute on function public.unlock_originals_episode(uuid, uuid) from public, anon;
grant execute on function public.unlock_originals_episode(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Admin writes.
-- ---------------------------------------------------------------------------
-- Same shape as the course and challenge upserts: SECURITY DEFINER with the
-- admin check inside, so the admin UI does not have to satisfy nested RLS.

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
    p_sort_order int
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

    insert into public.originals_series as s (
        id, slug, title, description, poster_url, banner_url, genre, tags,
        free_episodes, episode_price, is_published, sort_order, updated_at
    )
    values (
        coalesce(p_id, gen_random_uuid()), btrim(p_slug), btrim(p_title), p_description,
        p_poster_url, p_banner_url, p_genre, coalesce(p_tags, '{}'),
        p_free_episodes, p_episode_price, coalesce(p_is_published, false), coalesce(p_sort_order, 0), now()
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
        updated_at = now()
    returning s.id into v_id;

    return v_id;
end;
$$;

create or replace function public.admin_delete_originals_series(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (select 1 from public.admin_users where id = auth.uid()) then
        raise exception 'Admin access required';
    end if;
    delete from public.originals_series where id = p_id;
    return found;
end;
$$;

create or replace function public.admin_upsert_originals_episode(
    p_id uuid,
    p_series_id uuid,
    p_episode_number int,
    p_title text,
    p_description text,
    p_video_url text,
    p_thumbnail_url text,
    p_duration_seconds int,
    p_is_published boolean
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
    if p_series_id is null then
        raise exception 'An episode needs a series';
    end if;
    if p_episode_number is null or p_episode_number <= 0 then
        raise exception 'Episode number must be positive';
    end if;

    insert into public.originals_episodes as e (
        id, series_id, episode_number, title, description, video_url,
        thumbnail_url, duration_seconds, is_published, updated_at
    )
    values (
        coalesce(p_id, gen_random_uuid()), p_series_id, p_episode_number, btrim(p_title),
        p_description, p_video_url, p_thumbnail_url, p_duration_seconds,
        coalesce(p_is_published, true), now()
    )
    on conflict (id) do update set
        series_id = excluded.series_id,
        episode_number = excluded.episode_number,
        title = excluded.title,
        description = excluded.description,
        video_url = excluded.video_url,
        thumbnail_url = excluded.thumbnail_url,
        duration_seconds = excluded.duration_seconds,
        is_published = excluded.is_published,
        updated_at = now()
    returning e.id into v_id;

    return v_id;
end;
$$;

create or replace function public.admin_delete_originals_episode(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (select 1 from public.admin_users where id = auth.uid()) then
        raise exception 'Admin access required';
    end if;
    delete from public.originals_episodes where id = p_id;
    return found;
end;
$$;

revoke execute on function public.admin_upsert_originals_series(uuid, text, text, text, text, text, text, text[], int, int, boolean, int) from public, anon;
revoke execute on function public.admin_delete_originals_series(uuid) from public, anon;
revoke execute on function public.admin_upsert_originals_episode(uuid, uuid, int, text, text, text, text, int, boolean) from public, anon;
revoke execute on function public.admin_delete_originals_episode(uuid) from public, anon;

grant execute on function public.admin_upsert_originals_series(uuid, text, text, text, text, text, text, text[], int, int, boolean, int) to authenticated, service_role;
grant execute on function public.admin_delete_originals_series(uuid) to authenticated, service_role;
grant execute on function public.admin_upsert_originals_episode(uuid, uuid, int, text, text, text, text, int, boolean) to authenticated, service_role;
grant execute on function public.admin_delete_originals_episode(uuid) to authenticated, service_role;
