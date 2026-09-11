-- An unlocked episode plays for 60 days, not for ever.
--
-- Until now an unlock row was permanent: buy episode 4 once and it is yours
-- until the account is deleted. The catalogue is moving to a rental window, so
-- the row has to carry an expiry and every "does this viewer own it" check has
-- to read that expiry rather than the row's mere existence.
--
-- Rows written before today keep `expires_at` null and null means never. That
-- is deliberate and not a shortcut: those episodes were sold on the words
-- "yours to keep forever", and retroactively expiring them would take back
-- something people paid for under different terms. The window applies to
-- purchases from here on.

-- ---------------------------------------------------------------------------
-- 1. The column.
-- ---------------------------------------------------------------------------
alter table public.originals_unlocks add column if not exists expires_at timestamptz;

comment on column public.originals_unlocks.expires_at is
    'When this unlock lapses. Null is a legacy permanent unlock sold before the 60-day window.';

-- Deliberately not a partial index on `expires_at > now()`: an index predicate
-- has to be immutable and now() is not, so Postgres rejects it outright. The
-- expiry rides along in the index instead, which still lets the live-unlock
-- lookup be answered without touching the heap.
create index if not exists originals_unlocks_live_idx
    on public.originals_unlocks (profile_id, episode_id, expires_at);

-- ---------------------------------------------------------------------------
-- 2. The window, in one place.
-- ---------------------------------------------------------------------------
-- A function rather than a literal repeated in the unlock body and in every
-- query that reads it back: the number is a product decision and will be argued
-- about again, and it must never be 60 in one place and 30 in another.
create or replace function public.originals_unlock_window()
returns interval
language sql immutable as $$
    select interval '60 days';
$$;

grant execute on function public.originals_unlock_window() to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 3. Unlocking, with the window applied.
-- ---------------------------------------------------------------------------
-- Same body as 20260904120000, with two changes: the ownership check now
-- ignores a lapsed row, and the insert upserts rather than inserts.
--
-- The upsert is what makes a re-rental possible at all. `originals_unlocks` is
-- unique on (profile_id, episode_id), so a plain insert on a second purchase
-- raises a unique violation *after* the balance has already been debited —
-- the viewer would pay and be told the episode is not available.
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

    -- The opening episodes play for anyone. Deliberately not recorded as an
    -- unlock: a free episode is not an entitlement that could later be mistaken
    -- for a purchase if the free window is narrowed.
    if v_episode.episode_number <= v_series.free_episodes then
        select coalesce(credits_balance, 0) into v_balance from public.profiles where id = p_profile_id;
        return query select 'free'::text, 0, coalesce(v_balance, 0), v_episode.video_url;
        return;
    end if;

    perform 1 from public.profiles where id = p_profile_id for update;

    -- A live season pass covers the whole series.
    if public.originals_pass_expiry(p_profile_id, v_series.id) is not null then
        select coalesce(credits_balance, 0) into v_balance from public.profiles where id = p_profile_id;
        return query select 'pass'::text, 0, coalesce(v_balance, 0), v_episode.video_url;
        return;
    end if;

    -- Still inside its window, or a legacy permanent unlock. A lapsed row falls
    -- through to the charge below, which is the whole point of the change.
    if exists (
        select 1 from public.originals_unlocks
        where profile_id = p_profile_id
          and episode_id = p_episode_id
          and (expires_at is null or expires_at > now())
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
        return query select 'insufficient'::text, v_series.episode_price, v_balance, null::text;
        return;
    end if;

    update public.profiles
    set credits_balance = coalesce(credits_balance, 0) - v_series.episode_price
    where id = p_profile_id
    returning credits_balance into v_balance;

    insert into public.originals_unlocks (profile_id, episode_id, credits_spent, expires_at)
    values (p_profile_id, p_episode_id, v_series.episode_price, now() + public.originals_unlock_window())
    on conflict (profile_id, episode_id) do update
        set credits_spent = excluded.credits_spent,
            expires_at = excluded.expires_at,
            created_at = now();

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
-- 4. What this viewer currently holds, for the account page.
-- ---------------------------------------------------------------------------
-- Returned from one function rather than assembled in the app, so the "is it
-- still live" rule lives next to the rule the unlock path uses instead of being
-- reimplemented in TypeScript where it can drift.
create or replace function public.originals_my_unlocks(p_profile_id uuid)
returns table (
    episode_id uuid,
    episode_number int,
    episode_title text,
    series_slug text,
    series_title text,
    poster_url text,
    credits_spent int,
    unlocked_at timestamptz,
    expires_at timestamptz
)
language sql
stable
security definer
set search_path = public as $$
    select
        u.episode_id,
        e.episode_number,
        e.title,
        s.slug,
        s.title,
        s.poster_url,
        u.credits_spent,
        u.created_at,
        u.expires_at
    from public.originals_unlocks u
    join public.originals_episodes e on e.id = u.episode_id
    join public.originals_series s on s.id = e.series_id
    where u.profile_id = p_profile_id
      and (auth.uid() = p_profile_id or coalesce(auth.role(), '') = 'service_role')
      and (u.expires_at is null or u.expires_at > now())
    order by u.created_at desc;
$$;

revoke execute on function public.originals_my_unlocks(uuid) from public, anon;
grant execute on function public.originals_my_unlocks(uuid) to authenticated, service_role;
