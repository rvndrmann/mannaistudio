-- Presale: a season pass sold under its standing price until a stated moment.
--
-- Lived in a code constant for exactly one commit, which meant a launch price
-- could only be set, moved or ended by a deploy. It belongs beside the other
-- per-series money on the row — free_episodes and episode_price — so whoever
-- is running the launch can open and close the window from the admin page.

alter table public.originals_series
    add column if not exists presale_price_inr int
        check (presale_price_inr is null or presale_price_inr > 0),
    add column if not exists presale_ends_at timestamptz;

comment on column public.originals_series.presale_price_inr is
    'Season pass price while the presale runs. Null means the standing price.';
comment on column public.originals_series.presale_ends_at is
    'When the presale closes. An instant, so every viewer sees the same deadline.';

-- The launch this was built for. Both columns or neither: a price with no
-- deadline is a permanent discount nobody decided to give.
update public.originals_series
set presale_price_inr = 19,
    presale_ends_at = '2026-09-14T18:30:00+00'
where slug = 'dil-ka-sauda-1980'
  and presale_price_inr is null;

-- New signature rather than an edit in place, for the same reason as last
-- time: a stale client calling the old one would save a series and silently
-- clear the presale it is in the middle of.

drop function if exists public.admin_upsert_originals_series(uuid, text, text, text, text, text, text, text[], int, int, boolean, int, int);

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
    p_planned_episodes int,
    p_presale_price_inr int,
    p_presale_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid;
    v_presale_price int;
    v_presale_ends timestamptz;
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
    if p_presale_price_inr is not null and p_presale_price_inr <= 0 then
        raise exception 'Presale price must be positive';
    end if;

    -- Half a presale is not a presale. A price with no closing time would
    -- discount the pass for ever, and a closing time with no price would
    -- count down to nothing, so either both are set or the presale is off.
    if p_presale_price_inr is null or p_presale_ends_at is null then
        v_presale_price := null;
        v_presale_ends := null;
    else
        v_presale_price := p_presale_price_inr;
        v_presale_ends := p_presale_ends_at;
    end if;

    insert into public.originals_series as s (
        id, slug, title, description, poster_url, banner_url, genre, tags,
        free_episodes, episode_price, is_published, sort_order, planned_episodes,
        presale_price_inr, presale_ends_at, updated_at
    )
    values (
        coalesce(p_id, gen_random_uuid()), btrim(p_slug), btrim(p_title), p_description,
        p_poster_url, p_banner_url, p_genre, coalesce(p_tags, '{}'),
        p_free_episodes, p_episode_price, coalesce(p_is_published, false), coalesce(p_sort_order, 0),
        p_planned_episodes, v_presale_price, v_presale_ends, now()
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
        presale_price_inr = excluded.presale_price_inr,
        presale_ends_at = excluded.presale_ends_at,
        updated_at = now()
    returning s.id into v_id;

    return v_id;
end;
$$;

revoke execute on function public.admin_upsert_originals_series(uuid, text, text, text, text, text, text, text[], int, int, boolean, int, int, int, timestamptz) from public, anon;
grant execute on function public.admin_upsert_originals_series(uuid, text, text, text, text, text, text, text[], int, int, boolean, int, int, int, timestamptz) to authenticated, service_role;
