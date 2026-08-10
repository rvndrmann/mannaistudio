-- Teams with owner-allocated credits.
--
-- Each account may belong to at most one team (enforced by a unique constraint
-- on team_members.profile_id). Members must already be registered on the
-- platform: the owner adds them by the email stored on their profile.
--
-- Credit allocation moves real balance between profiles rather than tracking a
-- separate team ledger, so the Studio credit badge, deduct_user_credits, and the
-- usage history all stay consistent with a single source of truth.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  -- The team's own credit pool. Credits reach it from a personal balance via
  -- transfer_team_credits, and leave it to a member via allocate_team_credits.
  credits_balance int not null default 0 check (credits_balance >= 0),
  created_at timestamptz not null default now()
);

alter table public.teams add column if not exists credits_balance int not null default 0;

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  unique (team_id, profile_id),
  -- One team per account.
  unique (profile_id)
);

create index if not exists team_members_team_id_idx on public.team_members (team_id);
create index if not exists teams_owner_id_idx on public.teams (owner_id);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

-- Membership is read through a SECURITY DEFINER helper so the policies below do
-- not recurse into team_members while that table is itself being filtered.
create or replace function public.current_team_id()
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from public.team_members where profile_id = auth.uid() limit 1;
$$;

drop policy if exists "Members can view their team" on public.teams;
create policy "Members can view their team"
  on public.teams for select
  to authenticated
  using (id = public.current_team_id());

drop policy if exists "Members can view their team roster" on public.team_members;
create policy "Members can view their team roster"
  on public.team_members for select
  to authenticated
  using (team_id = public.current_team_id());

-- Writes go exclusively through the SECURITY DEFINER functions below, which
-- check the caller's role. No direct insert/update/delete policies are granted.

create or replace function public.team_role(p_profile_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.team_members where profile_id = p_profile_id limit 1;
$$;

create or replace function public.create_team(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_team_id uuid;
  trimmed text := nullif(btrim(p_name), '');
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if trimmed is null then raise exception 'Team name is required'; end if;
  if exists (select 1 from public.team_members where profile_id = auth.uid()) then
    raise exception 'You already belong to a team. Leave or disband it first.';
  end if;

  insert into public.teams (name, owner_id) values (trimmed, auth.uid()) returning id into new_team_id;
  insert into public.team_members (team_id, profile_id, role) values (new_team_id, auth.uid(), 'owner');
  return new_team_id;
end;
$$;

create or replace function public.add_team_member(p_email text, p_role text default 'member')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  caller_role text;
  caller_team uuid;
  target_id uuid;
  normalized_email text := lower(btrim(p_email));
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_role not in ('admin', 'member', 'viewer') then raise exception 'Invalid role'; end if;

  select team_id, role into caller_team, caller_role from public.team_members where profile_id = auth.uid();
  if caller_team is null then raise exception 'You do not belong to a team'; end if;
  if caller_role not in ('owner', 'admin') then raise exception 'Only the team owner or an admin can add members'; end if;

  select id into target_id from public.profiles where lower(email) = normalized_email limit 1;
  if target_id is null then
    raise exception 'No account is registered with that email. Ask them to sign up first, then add them again.';
  end if;
  if exists (select 1 from public.team_members where profile_id = target_id) then
    raise exception 'That account already belongs to a team';
  end if;

  insert into public.team_members (team_id, profile_id, role) values (caller_team, target_id, p_role);
  return target_id;
end;
$$;

create or replace function public.update_team_member_role(p_profile_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  caller_role text;
  caller_team uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_role not in ('admin', 'member', 'viewer') then raise exception 'Invalid role'; end if;

  select team_id, role into caller_team, caller_role from public.team_members where profile_id = auth.uid();
  if caller_team is null then raise exception 'You do not belong to a team'; end if;
  if caller_role not in ('owner', 'admin') then raise exception 'Only the team owner or an admin can change roles'; end if;
  if p_profile_id = auth.uid() then raise exception 'You cannot change your own role'; end if;
  if (select role from public.team_members where profile_id = p_profile_id and team_id = caller_team) = 'owner' then
    raise exception 'The team owner role cannot be changed';
  end if;

  update public.team_members set role = p_role where profile_id = p_profile_id and team_id = caller_team;
  if not found then raise exception 'That member is not on your team'; end if;
end;
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
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select id, credits_balance into caller_team, pool from public.teams where owner_id = auth.uid() for update;
  if caller_team is null then raise exception 'Only the team owner can disband the team'; end if;

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

-- Moves credits between the caller's personal balance and the team pool.
-- A positive amount transfers personal -> team; a negative amount transfers back.
-- Every movement has exactly one profile side, so credit_transactions records it
-- against that profile and the team pool is the counterparty.
create or replace function public.transfer_team_credits(p_amount int)
returns table (team_balance int, personal_balance int)
language plpgsql security definer set search_path = public as $$
declare
  caller_role text;
  caller_team uuid;
  team_bal int;
  personal_bal int;
  move int := abs(p_amount);
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_amount = 0 then raise exception 'Enter a credit amount'; end if;

  select team_id, role into caller_team, caller_role from public.team_members where profile_id = auth.uid();
  if caller_team is null then raise exception 'You do not belong to a team'; end if;
  if caller_role not in ('owner', 'admin') then raise exception 'Only the team owner or an admin can move team credits'; end if;

  -- Lock the team row first, then the profile, in every path that touches both.
  select credits_balance into team_bal from public.teams where id = caller_team for update;
  perform 1 from public.profiles where id = auth.uid() for update;
  select coalesce(credits_balance, 0) into personal_bal from public.profiles where id = auth.uid();

  if p_amount > 0 then
    if personal_bal < move then
      raise exception 'Not enough personal credits. Available: %, requested: %', personal_bal, move;
    end if;
    update public.profiles set credits_balance = coalesce(credits_balance, 0) - move where id = auth.uid()
      returning credits_balance into personal_bal;
    update public.teams set credits_balance = credits_balance + move where id = caller_team
      returning credits_balance into team_bal;
    insert into public.credit_transactions (profile_id, amount, balance_after, type, description)
    values (auth.uid(), -move, personal_bal, 'team_transfer', 'Transferred to team pool');
  else
    if team_bal < move then
      raise exception 'Not enough team credits. Available: %, requested: %', team_bal, move;
    end if;
    update public.teams set credits_balance = credits_balance - move where id = caller_team
      returning credits_balance into team_bal;
    update public.profiles set credits_balance = coalesce(credits_balance, 0) + move where id = auth.uid()
      returning credits_balance into personal_bal;
    insert into public.credit_transactions (profile_id, amount, balance_after, type, description)
    values (auth.uid(), move, personal_bal, 'team_transfer', 'Transferred from team pool');
  end if;

  return query select team_bal, personal_bal;
end;
$$;

-- Moves credits between the team pool and a member's personal balance.
-- A positive amount allocates pool -> member; a negative amount reclaims.
create or replace function public.allocate_team_credits(p_profile_id uuid, p_amount int)
returns table (team_balance int, member_balance int)
language plpgsql security definer set search_path = public as $$
declare
  caller_role text;
  caller_team uuid;
  team_bal int;
  member_bal int;
  move int := abs(p_amount);
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_amount = 0 then raise exception 'Enter a credit amount'; end if;

  select team_id, role into caller_team, caller_role from public.team_members where profile_id = auth.uid();
  if caller_team is null then raise exception 'You do not belong to a team'; end if;
  if caller_role not in ('owner', 'admin') then raise exception 'Only the team owner or an admin can allocate credits'; end if;
  if not exists (select 1 from public.team_members where profile_id = p_profile_id and team_id = caller_team) then
    raise exception 'That member is not on your team';
  end if;

  select credits_balance into team_bal from public.teams where id = caller_team for update;
  perform 1 from public.profiles where id = p_profile_id for update;
  select coalesce(credits_balance, 0) into member_bal from public.profiles where id = p_profile_id;

  if p_amount > 0 then
    if team_bal < move then
      raise exception 'Not enough team credits. Available: %, requested: %', team_bal, move;
    end if;
    update public.teams set credits_balance = credits_balance - move where id = caller_team
      returning credits_balance into team_bal;
    update public.profiles set credits_balance = coalesce(credits_balance, 0) + move where id = p_profile_id
      returning credits_balance into member_bal;
    insert into public.credit_transactions (profile_id, amount, balance_after, type, description)
    values (p_profile_id, move, member_bal, 'team_allocation', 'Allocated from team pool');
  else
    if member_bal < move then
      raise exception 'That member only has % credits', member_bal;
    end if;
    update public.profiles set credits_balance = coalesce(credits_balance, 0) - move where id = p_profile_id
      returning credits_balance into member_bal;
    update public.teams set credits_balance = credits_balance + move where id = caller_team
      returning credits_balance into team_bal;
    insert into public.credit_transactions (profile_id, amount, balance_after, type, description)
    values (p_profile_id, -move, member_bal, 'team_allocation', 'Reclaimed to team pool');
  end if;

  return query select team_bal, member_bal;
end;
$$;

-- The roster shows each member's balance, which RLS on profiles would otherwise
-- hide. Restricted to callers who share the team.
create or replace function public.team_roster()
returns table (profile_id uuid, full_name text, email text, avatar_url text, role text, credits_balance int, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  caller_team uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select team_id into caller_team from public.team_members where profile_id = auth.uid();
  if caller_team is null then return; end if;

  return query
    select p.id, p.full_name, p.email, p.avatar_url, m.role, coalesce(p.credits_balance, 0), m.created_at
    from public.team_members m
    join public.profiles p on p.id = m.profile_id
    where m.team_id = caller_team
    order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.created_at;
end;
$$;

grant execute on function public.create_team(text) to authenticated;
grant execute on function public.add_team_member(text, text) to authenticated;
grant execute on function public.update_team_member_role(uuid, text) to authenticated;
grant execute on function public.remove_team_member(uuid) to authenticated;
grant execute on function public.disband_team() to authenticated;
grant execute on function public.allocate_team_credits(uuid, int) to authenticated;
grant execute on function public.transfer_team_credits(int) to authenticated;
grant execute on function public.team_roster() to authenticated;
grant execute on function public.current_team_id() to authenticated;
grant execute on function public.team_role(uuid) to authenticated;
