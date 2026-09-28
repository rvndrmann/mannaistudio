alter table public.academy_offers
  add column if not exists weekly_capacity integer;

alter table public.academy_offers
  drop constraint if exists academy_offers_weekly_capacity_check;
alter table public.academy_offers
  add constraint academy_offers_weekly_capacity_check
  check (weekly_capacity is null or weekly_capacity > 0);

alter table public.academy_offer_purchases
  add column if not exists booking_week_start date;

create index if not exists academy_offer_purchases_week_idx
  on public.academy_offer_purchases (offer_id, booking_week_start);

create table if not exists public.academy_offer_reservations (
  order_id text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  offer_id uuid not null references public.academy_offers(id) on delete cascade,
  week_start date not null,
  expires_at timestamptz not null default (now() + interval '20 minutes'),
  created_at timestamptz not null default now()
);

create index if not exists academy_offer_reservations_week_idx
  on public.academy_offer_reservations (offer_id, week_start, expires_at);

alter table public.academy_offer_reservations enable row level security;
revoke all on public.academy_offer_reservations from anon, authenticated;
grant all on public.academy_offer_reservations to service_role;

create or replace function public.reserve_academy_coaching_slot(
  p_order_id text,
  p_profile_id uuid,
  p_offer_id uuid,
  p_week_start date
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.academy_offers%rowtype;
  v_sold integer;
  v_week_reserved integer;
begin
  select * into v_offer from public.academy_offers where id = p_offer_id for update;
  if not found or not v_offer.active or v_offer.offer_type <> 'coaching' then
    raise exception 'This coaching offer is unavailable.';
  end if;

  delete from public.academy_offer_reservations where expires_at <= now();

  if v_offer.max_purchases is not null then
    select count(*) into v_sold from public.academy_offer_purchases where offer_id = p_offer_id;
    if v_sold >= v_offer.max_purchases then raise exception 'All coaching places have been booked.'; end if;
  end if;

  if v_offer.weekly_capacity is not null then
    select count(*) into v_sold from public.academy_offer_purchases
      where offer_id = p_offer_id and booking_week_start = p_week_start;
    select count(*) into v_week_reserved from public.academy_offer_reservations
      where offer_id = p_offer_id and week_start = p_week_start and expires_at > now();
    if v_sold + v_week_reserved >= v_offer.weekly_capacity then
      raise exception 'That week is fully booked. Please choose next week.';
    end if;
  end if;

  insert into public.academy_offer_reservations(order_id, profile_id, offer_id, week_start)
  values (p_order_id, p_profile_id, p_offer_id, p_week_start);
end;
$$;

create or replace function public.complete_academy_coaching_reservation(
  p_order_id text,
  p_payment_id text,
  p_amount numeric
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.academy_offer_reservations%rowtype;
  v_offer public.academy_offers%rowtype;
  v_sold integer;
begin
  select * into v_reservation from public.academy_offer_reservations
    where order_id = p_order_id for update;
  if not found then
    if exists (select 1 from public.academy_offer_purchases where payment_id = p_payment_id) then
      return true;
    end if;
    raise exception 'This coaching reservation expired. Contact support to confirm your payment.';
  end if;

  select * into v_offer from public.academy_offers where id = v_reservation.offer_id for update;
  if not found or not v_offer.active then raise exception 'This coaching offer is no longer available.'; end if;
  if v_offer.max_purchases is not null then
    select count(*) into v_sold from public.academy_offer_purchases where offer_id = v_offer.id;
    if v_sold >= v_offer.max_purchases then raise exception 'All coaching places have been booked.'; end if;
  end if;

  insert into public.academy_offer_purchases(profile_id, offer_id, payment_id, amount, booking_week_start)
  values (v_reservation.profile_id, v_reservation.offer_id, p_payment_id, p_amount, v_reservation.week_start)
  on conflict (payment_id) do nothing;
  delete from public.academy_offer_reservations where order_id = p_order_id;
  return true;
end;
$$;

revoke all on function public.reserve_academy_coaching_slot(text, uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.complete_academy_coaching_reservation(text, text, numeric) from public, anon, authenticated;
grant execute on function public.reserve_academy_coaching_slot(text, uuid, uuid, date) to service_role;
grant execute on function public.complete_academy_coaching_reservation(text, text, numeric) to service_role;
