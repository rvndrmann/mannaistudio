-- team_roster declares an OUT parameter named profile_id, which made the bare
-- "where profile_id = auth.uid()" lookup ambiguous against team_members. Qualify
-- the column so the membership lookup resolves to the table, not the output row.

create or replace function public.team_roster()
returns table (profile_id uuid, full_name text, email text, avatar_url text, role text, credits_balance int, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  caller_team uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select m.team_id into caller_team from public.team_members m where m.profile_id = auth.uid();
  if caller_team is null then return; end if;

  return query
    select p.id, p.full_name, p.email, p.avatar_url, m.role, coalesce(p.credits_balance, 0), m.created_at
    from public.team_members m
    join public.profiles p on p.id = m.profile_id
    where m.team_id = caller_team
    order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.created_at;
end;
$$;

grant execute on function public.team_roster() to authenticated;
