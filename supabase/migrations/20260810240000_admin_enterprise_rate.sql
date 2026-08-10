-- The enterprise rate was only changeable by editing site_settings directly.
-- This exposes it through an admin-guarded function so pricing can be managed
-- from the admin dashboard like every other Director setting.
--
-- Existing orders are unaffected: each order stores the rate it was created
-- with, so changing the price here only affects new requests.

create or replace function public.admin_update_enterprise_rate(
  p_usd_per_minute integer,
  p_enabled boolean default true
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  next_value jsonb;
begin
  if not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception 'Only admins can change the enterprise rate';
  end if;
  if p_usd_per_minute is null or p_usd_per_minute <= 0 then
    raise exception 'The rate must be greater than zero';
  end if;
  if p_usd_per_minute > 100000 then
    raise exception 'That rate looks like a mistake. Enter the price for one finished minute.';
  end if;

  next_value := jsonb_build_object(
    'usdPerMinute', p_usd_per_minute,
    'currency', 'USD',
    'enabled', coalesce(p_enabled, true)
  );

  insert into public.site_settings (key, value)
  values ('enterprise_rate', next_value)
  on conflict (key) do update set value = excluded.value;

  return next_value;
end;
$$;

grant execute on function public.admin_update_enterprise_rate(integer, boolean) to authenticated;
