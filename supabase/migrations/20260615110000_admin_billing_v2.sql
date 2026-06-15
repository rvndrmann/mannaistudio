-- Update admin_update_billing_settings to include payments_enabled
-- and add a new RPC for free trial settings.

drop function if exists public.admin_update_billing_settings(int, boolean, int, text);

create or replace function public.admin_update_billing_settings(
    p_monthly_price int,
    p_offer_enabled boolean,
    p_offer_price int,
    p_offer_text text,
    p_payments_enabled boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_value jsonb;
    v_existing jsonb;
begin
    if not exists (select 1 from public.admin_users where id = auth.uid()) then
        raise exception 'not authorized';
    end if;

    -- Preserve existing fields like plan_name
    select value into v_existing from public.site_settings where key = 'billing';

    v_value := jsonb_build_object(
        'plan_name', coalesce(v_existing->>'plan_name', 'AI Director Hub Pro'),
        'monthly_price', greatest(p_monthly_price, 1),
        'offer_enabled', coalesce(p_offer_enabled, false),
        'offer_price', greatest(p_offer_price, 1),
        'offer_text', coalesce(nullif(trim(p_offer_text), ''), 'Limited offer: AI Director Hub Pro'),
        'payments_enabled', coalesce(p_payments_enabled, false)
    );

    insert into public.site_settings (key, value, updated_at)
    values ('billing', v_value, now())
    on conflict (key) do update
    set value = excluded.value,
        updated_at = now();

    return v_value;
end;
$$;

grant execute on function public.admin_update_billing_settings(int, boolean, int, text, boolean) to authenticated;

-- RPC to update free trial settings from admin panel
create or replace function public.admin_update_free_trial(
    p_enabled boolean,
    p_trial_days int,
    p_promo_end_date text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_value jsonb;
begin
    if not exists (select 1 from public.admin_users where id = auth.uid()) then
        raise exception 'not authorized';
    end if;

    v_value := jsonb_build_object(
        'enabled', coalesce(p_enabled, false),
        'trial_days', greatest(coalesce(p_trial_days, 4), 1),
        'promo_end_date', coalesce(nullif(trim(p_promo_end_date), ''), (now() + interval '30 days')::text)
    );

    insert into public.site_settings (key, value, updated_at)
    values ('free_trial', v_value, now())
    on conflict (key) do update
    set value = excluded.value,
        updated_at = now();

    return v_value;
end;
$$;

grant execute on function public.admin_update_free_trial(boolean, int, text) to authenticated;
