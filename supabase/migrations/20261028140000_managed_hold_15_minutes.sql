-- Checkout holds last 15 minutes, and the public page can say so.
--
-- A buyer who opened checkout and walked away kept the last slot from everyone
-- else for 30 minutes. The hold is now 15: long enough to pay, short enough that
-- an abandoned attempt gives the slot back while the next buyer is still on the
-- page. Nothing has to run for that to happen — the hold is only ever a window
-- on created_at, so an unpaid order simply stops counting.
--
-- managed_offer_availability also returns how many slots are held by other
-- buyers' checkouts and when the first of those holds runs out, so a buyer who
-- finds the package full can be told "held by someone checking out, free again
-- at 14:25 if they don't pay" instead of a bare "Slots full".

create or replace function public.managed_package_load(p_package_key text, p_buyer uuid default null)
returns table (
  slot_limit integer,
  queue_limit integer,
  slots_taken integer,
  queue_taken integer,
  queue_waiting integer,
  placement text
)
language sql stable security definer set search_path = public as $$
  with pkg as (
    select p.slot_limit, p.queue_limit from public.managed_offer_packages p where p.key = p_package_key
  ),
  counts as (
    select
      -- Paid and running.
      (select count(*) from public.managed_projects mp
        where mp.package_key = p_package_key and mp.queue_state = 'slot'
          and mp.payment_status = 'paid' and mp.status not in ('completed', 'cancelled'))
      -- Plus checkouts still inside their hold, once per other buyer.
      + (select count(distinct mp.user_id) from public.managed_projects mp
          where mp.package_key = p_package_key and mp.queue_state = 'slot'
            and mp.payment_status = 'pending' and mp.status <> 'cancelled'
            and mp.created_at > now() - interval '15 minutes'
            and mp.user_id is distinct from p_buyer) as slots_taken,
      (select count(*) from public.managed_projects mp
        where mp.package_key = p_package_key and mp.queue_state = 'queued'
          and mp.payment_status = 'paid' and mp.status not in ('completed', 'cancelled')) as queue_waiting,
      (select count(distinct mp.user_id) from public.managed_projects mp
        where mp.package_key = p_package_key and mp.queue_state = 'queued'
          and mp.payment_status = 'pending' and mp.status <> 'cancelled'
          and mp.created_at > now() - interval '15 minutes'
          and mp.user_id is distinct from p_buyer) as queue_holds
  )
  select
    pkg.slot_limit,
    pkg.queue_limit,
    counts.slots_taken::int,
    (counts.queue_waiting + counts.queue_holds)::int,
    counts.queue_waiting::int,
    case
      when pkg.slot_limit is null
        or (counts.slots_taken < pkg.slot_limit and counts.queue_waiting = 0) then 'slot'
      when pkg.queue_limit is null
        or counts.queue_waiting + counts.queue_holds < pkg.queue_limit then 'queue'
      else 'sold_out'
    end
  from counts left join pkg on true;
$$;

drop function if exists public.managed_offer_availability();

-- Still counts only: no order, buyer or price leaves this function.
create function public.managed_offer_availability()
returns table (
  package_key text,
  slot_limit integer,
  queue_limit integer,
  slots_taken integer,
  queue_taken integer,
  queue_waiting integer,
  placement text,
  slots_held integer,
  held_until timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.key, l.slot_limit, l.queue_limit, l.slots_taken, l.queue_taken, l.queue_waiting, l.placement,
    coalesce(h.slots_held, 0)::int, h.held_until
  from public.managed_offer_packages p
  cross join lateral public.managed_package_load(p.key, auth.uid()) l
  left join lateral (
    -- Each other buyer's hold ends 15 minutes after their latest attempt.
    select count(*) as slots_held, min(b.last_attempt) + interval '15 minutes' as held_until
    from (
      select max(mp.created_at) as last_attempt from public.managed_projects mp
      where mp.package_key = p.key and mp.queue_state = 'slot'
        and mp.payment_status = 'pending' and mp.status <> 'cancelled'
        and mp.created_at > now() - interval '15 minutes'
        and mp.user_id is distinct from auth.uid()
      group by mp.user_id
    ) b
  ) h on true
  where p.slot_limit is not null or p.queue_limit is not null;
$$;

revoke execute on function public.managed_offer_availability() from public;
grant execute on function public.managed_offer_availability() to anon, authenticated;
