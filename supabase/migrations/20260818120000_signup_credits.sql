-- Free signup credits replace the free trial.
--
-- The trial handed a new account Pro membership status but no credits, so a
-- trial user could talk to the Director and not generate a single frame. What a
-- new account actually needs is a balance to spend, so the grant is credits now
-- and the trial is switched off.
--
-- Admin controls it from the panel: the amount, and whether it is granted at
-- all, both live in site_settings under 'signup_credits'.

insert into public.site_settings (key, value)
values ('signup_credits', '{"enabled": true, "amount": 100}'::jsonb)
on conflict (key) do nothing;

-- Retire the trial. The grant function still exists and still checks this flag,
-- so it now returns false for every signup rather than needing its call removed
-- from anywhere it may still be wired up.
update public.site_settings
set value = value || '{"enabled": false}'::jsonb,
    updated_at = now()
where key = 'free_trial';

-- One grant per account, ever. The auth callback runs on every sign-in, not only
-- the first one, so without a guard a user would collect another 100 credits
-- each time they logged out and back in. The signup transaction row is the
-- guard: if one exists for this profile, the grant has already happened.
create or replace function public.grant_signup_credits(p_user_id uuid)
returns table (granted boolean, new_balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_settings jsonb;
    v_amount int;
    v_balance int;
begin
    if p_user_id is null then
        raise exception 'A user is required';
    end if;

    select value into v_settings from public.site_settings where key = 'signup_credits';

    if v_settings is null or not coalesce((v_settings->>'enabled')::boolean, false) then
        select coalesce(credits_balance, 0) into v_balance from public.profiles where id = p_user_id;
        return query select false, coalesce(v_balance, 0);
        return;
    end if;

    v_amount := greatest(coalesce((v_settings->>'amount')::int, 100), 0);

    if v_amount = 0 then
        select coalesce(credits_balance, 0) into v_balance from public.profiles where id = p_user_id;
        return query select false, coalesce(v_balance, 0);
        return;
    end if;

    -- Lock the profile so two sign-ins arriving together cannot both pass the
    -- existence check before either has written its transaction.
    perform 1 from public.profiles where id = p_user_id for update;

    if exists (
        select 1 from public.credit_transactions
        where profile_id = p_user_id and type = 'signup'
    ) then
        select coalesce(credits_balance, 0) into v_balance from public.profiles where id = p_user_id;
        return query select false, coalesce(v_balance, 0);
        return;
    end if;

    update public.profiles
    set credits_balance = coalesce(credits_balance, 0) + v_amount
    where id = p_user_id
    returning credits_balance into v_balance;

    if v_balance is null then
        return query select false, 0;
        return;
    end if;

    insert into public.credit_transactions (profile_id, amount, balance_after, type, description)
    values (p_user_id, v_amount, v_balance, 'signup', 'Welcome credits');

    return query select true, v_balance;
end;
$$;

grant execute on function public.grant_signup_credits(uuid) to authenticated;

create index if not exists credit_transactions_signup_idx
  on public.credit_transactions (profile_id)
  where type = 'signup';

-- Admin panel writes the setting through here so the admin check lives in the
-- database rather than in the page that calls it.
create or replace function public.admin_update_signup_credits(
    p_enabled boolean,
    p_amount int
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
        'amount', greatest(coalesce(p_amount, 0), 0)
    );

    insert into public.site_settings (key, value, updated_at)
    values ('signup_credits', v_value, now())
    on conflict (key) do update
    set value = excluded.value,
        updated_at = now();

    return v_value;
end;
$$;

grant execute on function public.admin_update_signup_credits(boolean, int) to authenticated;
