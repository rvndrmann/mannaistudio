-- Every account gets a one-time 20 free bids so free users can post AND bid
-- on AI jobs without paying to start.

alter table public.profiles add column if not exists starter_bids_granted boolean not null default false;

create or replace function public.grant_starter_bids(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set bids = bids + 20, starter_bids_granted = true
  where id = p_user_id and starter_bids_granted = false;
  return found;
end; $$;
grant execute on function public.grant_starter_bids(uuid) to anon, authenticated;
