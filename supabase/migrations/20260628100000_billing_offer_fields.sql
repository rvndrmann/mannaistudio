-- Preserve razorpay_plan_id and offer_ends_at in the billing settings JSON so
-- an admin "Save" doesn't wipe the active plan / countdown-offer config.

create or replace function public.admin_update_billing_settings(
    p_monthly_price int,
    p_offer_enabled boolean,
    p_offer_price int,
    p_offer_text text,
    p_payments_enabled boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_value jsonb; v_existing jsonb;
begin
  if not exists (select 1 from public.admin_users where id = auth.uid()) then
    raise exception 'not authorized';
  end if;
  select value into v_existing from public.site_settings where key = 'billing';
  v_value := jsonb_build_object(
    'plan_name', coalesce(v_existing->>'plan_name', 'AI Director Hub Pro'),
    'monthly_price', greatest(p_monthly_price, 1),
    'offer_enabled', coalesce(p_offer_enabled, false),
    'offer_price', greatest(p_offer_price, 1),
    'offer_text', coalesce(nullif(trim(p_offer_text), ''), 'Limited offer'),
    'payments_enabled', coalesce(p_payments_enabled, false),
    'razorpay_plan_id', coalesce(v_existing->>'razorpay_plan_id', ''),
    'offer_ends_at', coalesce(v_existing->>'offer_ends_at', '')
  );
  insert into public.site_settings (key, value, updated_at) values ('billing', v_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return v_value;
end; $$;
