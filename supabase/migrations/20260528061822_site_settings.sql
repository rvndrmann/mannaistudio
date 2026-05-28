create table if not exists public.site_settings (
    key text primary key,
    value jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

drop policy if exists "site settings are publicly readable" on public.site_settings;
create policy "site settings are publicly readable"
on public.site_settings for select
using (true);

insert into public.site_settings (key, value)
values (
    'billing',
    jsonb_build_object(
        'plan_name', 'AI Mastery Pro',
        'monthly_price', 999,
        'offer_enabled', false,
        'offer_price', 799,
        'offer_text', 'Limited offer: AI Mastery Pro for ₹799/month'
    )
)
on conflict (key) do nothing;

create or replace function public.admin_update_billing_settings(
    p_monthly_price integer,
    p_offer_enabled boolean,
    p_offer_price integer,
    p_offer_text text
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
        'plan_name', 'AI Mastery Pro',
        'monthly_price', greatest(p_monthly_price, 1),
        'offer_enabled', coalesce(p_offer_enabled, false),
        'offer_price', greatest(p_offer_price, 1),
        'offer_text', coalesce(nullif(trim(p_offer_text), ''), 'Limited offer: AI Mastery Pro')
    );

    insert into public.site_settings (key, value, updated_at)
    values ('billing', v_value, now())
    on conflict (key) do update
    set value = excluded.value,
        updated_at = now();

    return v_value;
end;
$$;

grant execute on function public.admin_update_billing_settings(integer, boolean, integer, text) to authenticated;
