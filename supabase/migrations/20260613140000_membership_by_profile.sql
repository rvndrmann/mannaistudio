-- Tie payments and membership activation to the user id (passed via PayU udf1)
-- instead of relying on the editable email field. Email remains a fallback.

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
        membership_payment_id = p_payment_id
    where id = p_profile_id;

    return true;
end;
$$;

grant execute on function public.activate_membership_by_profile(uuid, text) to anon, authenticated;

-- record_payment now accepts an optional profile id; falls back to email lookup.
drop function if exists public.record_payment(text, text, text, text, text, text);

create or replace function public.record_payment(
    p_email text,
    p_txnid text,
    p_payment_id text,
    p_amount text,
    p_product_info text,
    p_status text,
    p_profile_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile_id uuid := p_profile_id;
begin
    if v_profile_id is null then
        select id into v_profile_id
        from public.profiles
        where email = p_email
        limit 1;
    end if;

    insert into public.payments (profile_id, email, txnid, payment_id, amount, product_info, status)
    values (v_profile_id, p_email, p_txnid, p_payment_id, p_amount, p_product_info, p_status)
    on conflict (txnid, status) do nothing;
end;
$$;

grant execute on function public.record_payment(text, text, text, text, text, text, uuid) to anon, authenticated;
