-- Monthly credits for a paid membership.
--
-- Razorpay retries webhooks and can deliver subscription.charged more than once
-- for the same payment, so granting credits must be idempotent. The payment ID
-- is the key: a second delivery finds the existing transaction and grants
-- nothing, rather than handing out another month.

create index if not exists credit_transactions_payment_idx
  on public.credit_transactions ((metadata->>'payment_id'))
  where type = 'subscription';

create or replace function public.grant_subscription_credits(
  p_profile_id uuid,
  p_amount integer,
  p_payment_id text,
  p_tier text,
  p_description text default 'Membership monthly credits'
)
returns table (granted boolean, new_balance integer)
language plpgsql security definer set search_path = public as $$
declare
  updated_balance integer;
begin
  if p_profile_id is null then raise exception 'A profile is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Credit amount must be positive'; end if;
  if p_payment_id is null or btrim(p_payment_id) = '' then raise exception 'A payment reference is required'; end if;

  -- Lock the profile so two concurrent deliveries of the same webhook cannot both
  -- pass the existence check before either has written its transaction.
  perform 1 from public.profiles where id = p_profile_id for update;

  if exists (
    select 1 from public.credit_transactions
    where profile_id = p_profile_id
      and type = 'subscription'
      and metadata->>'payment_id' = p_payment_id
  ) then
    select coalesce(credits_balance, 0) into updated_balance from public.profiles where id = p_profile_id;
    return query select false, updated_balance;
    return;
  end if;

  update public.profiles
  set credits_balance = coalesce(credits_balance, 0) + p_amount
  where id = p_profile_id
  returning credits_balance into updated_balance;

  if updated_balance is null then
    insert into public.profiles (id, credits_balance) values (p_profile_id, p_amount)
    on conflict (id) do update set credits_balance = coalesce(public.profiles.credits_balance, 0) + p_amount
    returning credits_balance into updated_balance;
  end if;

  insert into public.credit_transactions (profile_id, amount, balance_after, type, description, metadata)
  values (
    p_profile_id,
    p_amount,
    updated_balance,
    'subscription',
    p_description,
    jsonb_build_object('payment_id', p_payment_id, 'tier', coalesce(p_tier, ''))
  );

  return query select true, updated_balance;
end;
$$;

grant execute on function public.grant_subscription_credits(uuid, integer, text, text, text) to authenticated, service_role;
