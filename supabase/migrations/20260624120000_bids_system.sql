-- Bids system for the AI Jobs marketplace.
-- Every paid member receives a one-time 100-bid bonus. Bids can also be
-- purchased (₹10/bid). Bidding on a job costs 2 bids.

alter table public.profiles add column if not exists bids integer not null default 0;
alter table public.profiles add column if not exists member_bid_bonus_granted boolean not null default false;

-- One-time 100-bid bonus for paid members.
create or replace function public.grant_member_bids(p_profile_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set bids = bids + 100, member_bid_bonus_granted = true
  where id = p_profile_id and member_bid_bonus_granted = false;
  return found;
end; $$;
grant execute on function public.grant_member_bids(uuid) to anon, authenticated;

-- Credit purchased bids (called by the bid-purchase webhook, server-side).
create or replace function public.add_bids(p_profile_id uuid, p_amount int)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_amount is null or p_amount <= 0 then return false; end if;
  update public.profiles set bids = bids + p_amount where id = p_profile_id;
  return found;
end; $$;
grant execute on function public.add_bids(uuid, int) to anon, authenticated;

-- Spend bids atomically for the calling (authenticated) user only.
create or replace function public.spend_bids(p_cost int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  update public.profiles set bids = bids - p_cost
  where id = v_uid and bids >= p_cost;
  return found;
end; $$;
grant execute on function public.spend_bids(int) to authenticated;
