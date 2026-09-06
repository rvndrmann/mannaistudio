-- `admin_originals_notify_list` never returned a row: it raised 42702,
-- "column reference id is ambiguous", on its very first statement.
--
-- The function RETURNS TABLE (id uuid, ...), and every one of those output
-- columns is also a PL/pgSQL variable in scope. So the admin check's
-- `where id = auth.uid()` was ambiguous between the OUT parameter `id` and
-- `admin_users.id`, and Postgres refused to guess. Qualifying the column
-- settles it.

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
    -- Qualified, because `id` is also one of this function's OUT parameters.
    if not exists (select 1 from public.admin_users a where a.id = auth.uid()) then
        raise exception 'Admin access required';
    end if;

    return query
    select r.id,
           r.series_id,
           s.title,
           r.episode_number,
           r.profile_id,
           p.full_name,
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
