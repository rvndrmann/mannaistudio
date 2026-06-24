-- activate_membership_by_profile now also clears is_trial.
-- Webhooks run with the anon key and no auth session, so a direct
-- profiles update would be blocked by RLS. Folding is_trial = false into
-- this SECURITY DEFINER function lets a successful charge convert a trial
-- user to a paid member correctly.

create or replace function public.activate_membership_by_profile(
    p_profile_id uuid,
    p_payment_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_current_expiry timestamptz;
begin
    select membership_expires_at into v_current_expiry
    from public.profiles
    where id = p_profile_id;

    if not found then
        return false;
    end if;

    update public.profiles
    set
        membership_status = 'active',
        membership_expires_at = case
            when v_current_expiry is not null and v_current_expiry > now()
                then v_current_expiry + interval '1 month'
            else now() + interval '1 month'
        end,
        membership_payment_id = p_payment_id,
        is_trial = false
    where id = p_profile_id;

    return true;
end;
$$;

grant execute on function public.activate_membership_by_profile(uuid, text) to anon, authenticated;
