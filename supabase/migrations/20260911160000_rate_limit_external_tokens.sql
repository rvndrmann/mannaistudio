-- The studio rate limiter keyed the bucket on auth.uid() alone, and returned
-- false — not an error — when there was none. A caller holding a minted
-- external token resolves to the service client, which has no auth.uid(), so
-- every director tool and approval it attempted was refused as "Too many
-- requests" on the first call against an empty bucket. Not throttling: a total
-- block on exactly the callers the MCP bridge is made of.
--
-- The identity is now passed in when the caller cannot supply one itself.
--
-- A signed-in caller may not name a user: auth.uid() wins whenever it is
-- present, so p_user_id is unreachable from the browser and no authenticated
-- user can burn through somebody else's quota by claiming to be them. Only a
-- service-role call — where auth.uid() is null by construction — can set it,
-- and the route that does has already traded the token for its owner.

drop function if exists public.creator_consume_rate_limit(text, integer, integer);

create or replace function public.creator_consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer,
  p_user_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_window timestamptz;
declare v_count integer;
declare v_user uuid;
begin
  -- Never coalesce these the other way round: a caller who has an identity is
  -- held to it.
  v_user := case when auth.uid() is not null then auth.uid() else p_user_id end;
  if v_user is null then return false; end if;
  if p_limit < 1 or p_window_seconds < 1 then raise exception 'invalid rate limit'; end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.creator_rate_limits(user_id, bucket, window_start, request_count)
  values (v_user, left(p_bucket, 100), v_window, 1)
  on conflict (user_id, bucket, window_start) do update
  set request_count = public.creator_rate_limits.request_count + 1
  returning request_count into v_count;
  return v_count <= p_limit;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC on a new function by default, so the
-- original's grant to `authenticated` never narrowed anything. Now that the
-- function accepts a user id, an anonymous caller must not be able to reach it
-- at all.
revoke execute on function public.creator_consume_rate_limit(text, integer, integer, uuid) from public;
revoke execute on function public.creator_consume_rate_limit(text, integer, integer, uuid) from anon;
grant execute on function public.creator_consume_rate_limit(text, integer, integer, uuid) to authenticated;
grant execute on function public.creator_consume_rate_limit(text, integer, integer, uuid) to service_role;
