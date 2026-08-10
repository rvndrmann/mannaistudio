-- Leaving a team must also end access to that team's shared projects.
--
-- Previously remove_team_member and disband_team only deleted the membership
-- row, leaving creator_project_members intact, so a removed member kept opening
-- every project that had been shared with them.

create or replace function public.revoke_team_project_shares(p_team_id uuid, p_profile_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.creator_project_members m
  using public.creator_projects p
  where m.project_id = p.id
    and m.profile_id = p_profile_id
    and p.user_id in (select profile_id from public.team_members where team_id = p_team_id);
$$;

create or replace function public.remove_team_member(p_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  caller_role text;
  caller_team uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select team_id, role into caller_team, caller_role from public.team_members where profile_id = auth.uid();
  if caller_team is null then raise exception 'You do not belong to a team'; end if;

  -- Members may remove themselves (leave); owners and admins may remove others.
  if p_profile_id <> auth.uid() and caller_role not in ('owner', 'admin') then
    raise exception 'Only the team owner or an admin can remove members';
  end if;
  if (select role from public.team_members where profile_id = p_profile_id and team_id = caller_team) = 'owner' then
    raise exception 'The owner cannot be removed. Disband the team instead.';
  end if;

  -- Revoke shared project access before dropping the membership row, so the
  -- team lookup inside the revoke still resolves.
  perform public.revoke_team_project_shares(caller_team, p_profile_id);

  delete from public.team_members where profile_id = p_profile_id and team_id = caller_team;
  if not found then raise exception 'That member is not on your team'; end if;
end;
$$;

create or replace function public.disband_team()
returns void language plpgsql security definer set search_path = public as $$
declare
  caller_team uuid;
  pool int;
  owner_bal int;
  member record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select id, credits_balance into caller_team, pool from public.teams where owner_id = auth.uid() for update;
  if caller_team is null then raise exception 'Only the team owner can disband the team'; end if;

  -- Nobody keeps access to the team's shared projects once the team is gone.
  for member in select profile_id from public.team_members where team_id = caller_team and profile_id <> auth.uid() loop
    perform public.revoke_team_project_shares(caller_team, member.profile_id);
  end loop;

  -- Never destroy credits sitting in the pool: return them to the owner first.
  if pool > 0 then
    update public.profiles set credits_balance = coalesce(credits_balance, 0) + pool where id = auth.uid()
      returning credits_balance into owner_bal;
    insert into public.credit_transactions (profile_id, amount, balance_after, type, description)
    values (auth.uid(), pool, owner_bal, 'team_transfer', 'Returned from disbanded team pool');
  end if;

  delete from public.teams where id = caller_team;
end;
$$;

grant execute on function public.revoke_team_project_shares(uuid, uuid) to authenticated;
grant execute on function public.remove_team_member(uuid) to authenticated;
grant execute on function public.disband_team() to authenticated;
