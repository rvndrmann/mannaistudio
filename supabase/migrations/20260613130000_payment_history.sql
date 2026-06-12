-- Payment history + monthly renewal stacking.

create table if not exists public.payments (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid references public.profiles(id) on delete set null,
    email text not null default '',
    txnid text not null default '',
    payment_id text not null default '',
    amount text not null default '',
    product_info text not null default '',
    status text not null default 'success' check (status in ('success', 'failed')),
    created_at timestamptz not null default now()
);

create index if not exists payments_profile_id_idx on public.payments (profile_id, created_at desc);
create unique index if not exists payments_txnid_status_idx on public.payments (txnid, status);

alter table public.payments enable row level security;

drop policy if exists "users read own payments" on public.payments;
create policy "users read own payments"
on public.payments for select
using (
    profile_id = auth.uid()
    or exists (select 1 from public.admin_users where id = auth.uid())
);

-- Record a payment (called from the PayU webhook; security definer because the
-- webhook runs with the anon key and no user session).
create or replace function public.record_payment(
    p_email text,
    p_txnid text,
    p_payment_id text,
    p_amount text,
    p_product_info text,
    p_status text
)
returns void
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

    insert into public.payments (profile_id, email, txnid, payment_id, amount, product_info, status)
    values (v_profile_id, p_email, p_txnid, p_payment_id, p_amount, p_product_info, p_status)
    on conflict (txnid, status) do nothing;
end;
$$;

grant execute on function public.record_payment(text, text, text, text, text, text) to anon, authenticated;

-- Monthly renewal: paying while still active extends from the current expiry,
-- not from today, so users never lose paid days.
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
    v_current_expiry timestamptz;
begin
    select id, membership_expires_at into v_profile_id, v_current_expiry
    from public.profiles
    where email = p_email
    limit 1;

    if v_profile_id is null then
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
    where id = v_profile_id;

    return true;
end;
$$;
