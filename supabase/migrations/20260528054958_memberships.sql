alter table public.profiles
add column if not exists membership_status text not null default 'free'
    check (membership_status in ('free', 'active', 'expired')),
add column if not exists membership_expires_at timestamptz,
add column if not exists membership_payment_id text;

create index if not exists profiles_membership_status_idx
on public.profiles(membership_status, membership_expires_at);

create or replace function public.activate_membership_by_email(
    p_email text,
    p_payment_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile_id uuid;
begin
    select id into v_profile_id
    from public.profiles
    where email = p_email
    limit 1;

    if v_profile_id is null then
        return false;
    end if;

    update public.profiles
    set
        membership_status = 'active',
        membership_expires_at = now() + interval '1 month',
        membership_payment_id = p_payment_id
    where id = v_profile_id;

    return true;
end;
$$;

grant execute on function public.activate_membership_by_email(text, text) to anon, authenticated;
