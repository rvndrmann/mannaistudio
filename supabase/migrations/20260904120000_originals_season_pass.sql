-- Season passes, a public path to the free episodes, and the 25-credit price.
--
-- Three changes that belong together, because they are one funnel: a stranger
-- can watch the opening episodes with no account at all, hits the paywall on
-- the first paid episode, and is offered a pass for that series.
--
-- The pass covers ONE series and lapses after 30 days. Both halves are
-- deliberate. Per-series because it is a season pass and the catalogue has to
-- stay sellable; expiring because a permanent pass on a shared login is a
-- customer who never comes back, and the whole point of the offer is to keep
-- them.

-- ---------------------------------------------------------------------------
-- 1. One price across the catalogue.
-- ---------------------------------------------------------------------------
alter table public.originals_series alter column episode_price set default 25;
update public.originals_series set episode_price = 25 where episode_price <> 25;

-- ---------------------------------------------------------------------------
-- 2. Season passes.
-- ---------------------------------------------------------------------------
create table if not exists public.originals_season_passes (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    series_id uuid not null references public.originals_series(id) on delete cascade,
    price_inr int not null,
    payment_id text,
    granted_at timestamptz not null default now(),
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

create index if not exists originals_passes_lookup_idx
    on public.originals_season_passes (profile_id, series_id, expires_at desc);

-- A payment delivers one pass. Razorpay can deliver the same payment twice
-- (a retried verify, a webhook racing the browser), and without this the
-- second delivery would sell a second pass for money already collected.
create unique index if not exists originals_passes_payment_idx
    on public.originals_season_passes (payment_id)
    where payment_id is not null;

alter table public.originals_season_passes enable row level security;

drop policy if exists "Users read own season passes" on public.originals_season_passes;
create policy "Users read own season passes"
    on public.originals_season_passes for select
    to authenticated
    using (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- 3. Granting a pass, once per payment.
-- ---------------------------------------------------------------------------
create or replace function public.grant_originals_season_pass(
    p_profile_id uuid,
    p_series_id uuid,
    p_price_inr int,
    p_payment_id text,
    p_days int default 30
)
returns table (granted boolean, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
    v_existing public.originals_season_passes%rowtype;
    v_from timestamptz;
    v_expires timestamptz;
begin
    -- Entitlements are granted by server code that has verified a payment.
    if coalesce(auth.role(), '') <> 'service_role' then
        raise exception 'Season passes can only be granted by the server';
    end if;
    if p_profile_id is null or p_series_id is null then
        raise exception 'A profile and a series are required';
    end if;
    if p_payment_id is null or btrim(p_payment_id) = '' then
        raise exception 'A payment reference is required';
    end if;

    perform 1 from public.profiles where id = p_profile_id for update;

    -- Same payment arriving twice returns the pass it already bought.
    select * into v_existing from public.originals_season_passes where payment_id = p_payment_id;
    if found then
        return query select false, v_existing.expires_at;
        return;
    end if;

    -- Renewing before the current pass lapses extends it rather than
    -- discarding the days already paid for.
    select max(sp.expires_at) into v_from
    from public.originals_season_passes sp
    where sp.profile_id = p_profile_id and sp.series_id = p_series_id;

    v_expires := greatest(coalesce(v_from, now()), now()) + make_interval(days => greatest(p_days, 1));

    insert into public.originals_season_passes (profile_id, series_id, price_inr, payment_id, expires_at)
    values (p_profile_id, p_series_id, greatest(coalesce(p_price_inr, 0), 0), p_payment_id, v_expires);

    return query select true, v_expires;
end;
$$;

revoke execute on function public.grant_originals_season_pass(uuid, uuid, int, text, int) from public, anon, authenticated;
grant execute on function public.grant_originals_season_pass(uuid, uuid, int, text, int) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Does this account hold a live pass for this series?
-- ---------------------------------------------------------------------------
create or replace function public.originals_pass_expiry(p_profile_id uuid, p_series_id uuid)
returns timestamptz
language sql stable security definer set search_path = public as $$
    select max(expires_at)
    from public.originals_season_passes
    where profile_id = p_profile_id
      and series_id = p_series_id
      and expires_at > now();
$$;

revoke execute on function public.originals_pass_expiry(uuid, uuid) from public, anon;
grant execute on function public.originals_pass_expiry(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. A pass plays the episode without spending credits.
-- ---------------------------------------------------------------------------
-- Same body as 20260901120000, with the pass check sitting between the free
-- window and the ownership check: a pass holder must never be charged, and must
-- never accumulate unlock rows that would outlive the pass.
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
-- 6. A free episode, for someone with no account at all.
-- ---------------------------------------------------------------------------
-- The opening episodes are the advertisement, so requiring a sign-in to watch
-- them puts the wall in front of the hook. This returns a playable URL only for
-- an episode inside a published series' free window, and nothing else — no
-- balance, no entitlement, no way to name a paid episode and be given it.
create or replace function public.originals_free_episode_url(p_episode_id uuid)
returns text
language sql stable security definer set search_path = public as $$
    select e.video_url
    from public.originals_episodes e
    join public.originals_series s on s.id = e.series_id
    where e.id = p_episode_id
      and e.is_published
      and s.is_published
      and e.episode_number <= s.free_episodes;
$$;

grant execute on function public.originals_free_episode_url(uuid) to anon, authenticated, service_role;
