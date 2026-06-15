-- Free trial: auto-grant Pro membership to new signups.
-- The trial_end_date in site_settings controls when the promotion ends.
-- Any user who signs up before that date gets free Pro until their trial_expires_at.

-- Add trial tracking column
alter table public.profiles
add column if not exists is_trial boolean not null default false;

-- Grant free trial to a user (only if they don't already have active membership)
create or replace function public.grant_free_trial(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_trial_days int;
    v_trial_end_date timestamptz;
    v_current_status text;
    v_settings jsonb;
begin
    -- Check if free trial promotion is active
    select value into v_settings
    from public.site_settings
    where key = 'free_trial';

    if v_settings is null or not (v_settings->>'enabled')::boolean then
        return false;
    end if;

    v_trial_days := coalesce((v_settings->>'trial_days')::int, 4);
    v_trial_end_date := case
        when v_settings->>'promo_end_date' is not null
            then (v_settings->>'promo_end_date')::timestamptz
        else now() + interval '30 days'
    end;

    -- Check if promotion period has ended
    if now() > v_trial_end_date then
        return false;
    end if;

    -- Check if user already has active membership
    select membership_status into v_current_status
    from public.profiles
    where id = p_user_id;

    if v_current_status = 'active' then
        return false;
    end if;

    -- Grant trial
    update public.profiles
    set
        membership_status = 'active',
        membership_expires_at = now() + (v_trial_days || ' days')::interval,
        is_trial = true
    where id = p_user_id;

    return true;
end;
$$;

grant execute on function public.grant_free_trial(uuid) to authenticated;

-- Insert default free trial settings (enabled, 4 days, promo ends July 1)
insert into public.site_settings (key, value)
values ('free_trial', '{"enabled": true, "trial_days": 4, "promo_end_date": "2026-07-01T23:59:59Z"}'::jsonb)
on conflict (key) do nothing;
