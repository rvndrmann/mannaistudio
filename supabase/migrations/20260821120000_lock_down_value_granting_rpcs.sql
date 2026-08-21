-- Close the credit ledger's front door.
--
-- Every function below is SECURITY DEFINER and takes the account to credit as a
-- parameter. None of them checked who was asking. Postgres grants EXECUTE to
-- PUBLIC by default and PostgREST publishes the whole `public` schema, so
-- `add_user_credits` was reachable from any browser holding the anon key — which
-- is every visitor, since the anon key ships in the client bundle. Several
-- functions went further and named `anon` in an explicit grant.
--
-- Two layers go in, because either alone has a failure mode. The grants are the
-- control: a role that cannot execute a function cannot reach its body at all.
-- The in-body identity checks are the backstop for the day someone adds a
-- convenience grant without reading this file.
--
-- Callers are split by who is legitimately allowed to ask:
--
--   service role only — money and entitlements. A browser has no business
--   calling these; they run from webhook and payment-verification routes that
--   hold the service key.
--
--   self or service role — the signed-in user acting on their own account, with
--   the server able to act for them. `p_user_id` must match `auth.uid()`.
--
-- The identity test is the one already established by
-- `refund_generation_credits`, which got this right when it was written.

-- ---------------------------------------------------------------------------
-- 1. Revoke the blanket grants.
-- ---------------------------------------------------------------------------
-- PUBLIC is the implicit grant every function is created with; `anon` was named
-- explicitly on several of these. Revoking PUBLIC alone would leave those
-- direct grants standing, so both are named here.

revoke execute on function public.add_user_credits(uuid, int, text, text) from public, anon, authenticated;
revoke execute on function public.deduct_user_credits(uuid, int, text, text) from public, anon;
revoke execute on function public.get_user_credits(uuid) from public, anon;
revoke execute on function public.refund_generation_credits(uuid, integer, text, text, uuid) from public, anon;
revoke execute on function public.add_bids(uuid, int) from public, anon, authenticated;
revoke execute on function public.grant_member_bids(uuid) from public, anon, authenticated;
revoke execute on function public.grant_subscription_credits(uuid, integer, text, text, text) from public, anon, authenticated;
revoke execute on function public.activate_membership_by_profile(uuid, text) from public, anon, authenticated;
revoke execute on function public.record_payment(text, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.grant_signup_credits(uuid) from public, anon;
revoke execute on function public.grant_starter_bids(uuid) from public, anon;
revoke execute on function public.grant_free_trial(uuid) from public, anon;
revoke execute on function public.set_razorpay_subscription(uuid, text) from public, anon;

-- ---------------------------------------------------------------------------
-- 2. Service-role-only functions: add the backstop identity check.
-- ---------------------------------------------------------------------------

create or replace function public.add_user_credits(
  p_user_id UUID,
  p_amount INT,
  p_type TEXT DEFAULT 'purchase',
  p_description TEXT DEFAULT 'Credit Top Up'
) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  updated_bal INT;
BEGIN
  -- Credit is only ever granted by server code that has verified a payment.
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Credits can only be granted by the server';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be positive';
  END IF;

  UPDATE profiles
  SET credits_balance = COALESCE(credits_balance, 0) + p_amount
  WHERE id = p_user_id
  RETURNING credits_balance INTO updated_bal;

  IF updated_bal IS NULL THEN
    INSERT INTO profiles (id, credits_balance)
    VALUES (p_user_id, p_amount + 100)
    RETURNING credits_balance INTO updated_bal;
  END IF;

  INSERT INTO credit_transactions (profile_id, amount, balance_after, type, description)
  VALUES (p_user_id, p_amount, updated_bal, p_type, p_description);

  RETURN updated_bal;
END;
$$;

create or replace function public.add_bids(p_profile_id uuid, p_amount int)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Bids can only be granted by the server';
  end if;
  if p_amount is null or p_amount <= 0 then return false; end if;
  update public.profiles set bids = bids + p_amount where id = p_profile_id;
  return found;
end; $$;

create or replace function public.grant_member_bids(p_profile_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Member bids can only be granted by the server';
  end if;
  update public.profiles set bids = bids + 100, member_bid_bonus_granted = true
  where id = p_profile_id and member_bid_bonus_granted = false;
  return found;
end; $$;

grant execute on function public.add_user_credits(uuid, int, text, text) to service_role;
grant execute on function public.add_bids(uuid, int) to service_role;
grant execute on function public.grant_member_bids(uuid) to service_role;
grant execute on function public.grant_subscription_credits(uuid, integer, text, text, text) to service_role;
grant execute on function public.activate_membership_by_profile(uuid, text) to service_role;
grant execute on function public.record_payment(text, text, text, text, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Self-or-service functions: the caller may only name their own account.
-- ---------------------------------------------------------------------------

create or replace function public.get_user_credits(p_user_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  bal INT;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id
     AND coalesce(auth.role(), '') <> 'service_role'
     AND NOT EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to read this balance';
  END IF;
  SELECT credits_balance INTO bal FROM profiles WHERE id = p_user_id;
  RETURN COALESCE(bal, 100);
END;
$$;

create or replace function public.deduct_user_credits(
  p_user_id UUID,
  p_amount INT,
  p_model TEXT DEFAULT NULL,
  p_description TEXT DEFAULT 'AI Generation'
) RETURNS TABLE (
  success BOOLEAN,
  new_balance INT,
  error_message TEXT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_bal INT;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Not authorized to spend these credits';
  END IF;
  -- A negative amount would run the deduction backwards and mint credits.
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Charge amount must be positive';
  END IF;

  SELECT credits_balance INTO current_bal FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF current_bal IS NULL THEN
    INSERT INTO profiles (id, credits_balance) VALUES (p_user_id, 100)
    ON CONFLICT (id) DO NOTHING;
    current_bal := 100;
  END IF;

  IF current_bal < p_amount THEN
    RETURN QUERY SELECT FALSE, current_bal, ('Insufficient credits. Required: ' || p_amount || ' Credits, Available: ' || current_bal || ' Credits. Please top up your credits.')::TEXT;
    RETURN;
  END IF;

  UPDATE profiles SET credits_balance = credits_balance - p_amount WHERE id = p_user_id;

  INSERT INTO credit_transactions (profile_id, amount, balance_after, type, model, description)
  VALUES (p_user_id, -p_amount, current_bal - p_amount, 'generation', p_model, p_description);

  RETURN QUERY SELECT TRUE, current_bal - p_amount, NULL::TEXT;
END;
$$;

create or replace function public.grant_starter_bids(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is distinct from p_user_id and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized to grant starter bids';
  end if;
  update public.profiles set bids = bids + 20, starter_bids_granted = true
  where id = p_user_id and starter_bids_granted = false;
  return found;
end; $$;

create or replace function public.set_razorpay_subscription(
    p_profile_id uuid,
    p_subscription_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is distinct from p_profile_id and coalesce(auth.role(), '') <> 'service_role' then
        raise exception 'Not authorized to change this subscription';
    end if;

    update public.profiles
    set razorpay_subscription_id = nullif(p_subscription_id, '')
    where id = p_profile_id;

    return found;
end;
$$;

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
    if auth.uid() is distinct from p_user_id and coalesce(auth.role(), '') <> 'service_role' then
        raise exception 'Not authorized to grant signup credits';
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
    if auth.uid() is distinct from p_user_id and coalesce(auth.role(), '') <> 'service_role' then
        raise exception 'Not authorized to grant a free trial';
    end if;

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

    if now() > v_trial_end_date then
        return false;
    end if;

    select membership_status into v_current_status
    from public.profiles
    where id = p_user_id;

    if v_current_status = 'active' then
        return false;
    end if;

    update public.profiles
    set
        membership_status = 'active',
        membership_expires_at = now() + (v_trial_days || ' days')::interval,
        is_trial = true
    where id = p_user_id;

    return true;
end;
$$;

grant execute on function public.get_user_credits(uuid) to authenticated, service_role;
grant execute on function public.deduct_user_credits(uuid, int, text, text) to authenticated, service_role;
grant execute on function public.refund_generation_credits(uuid, integer, text, text, uuid) to authenticated, service_role;
grant execute on function public.grant_starter_bids(uuid) to authenticated, service_role;
grant execute on function public.grant_signup_credits(uuid) to authenticated, service_role;
grant execute on function public.grant_free_trial(uuid) to authenticated, service_role;
grant execute on function public.set_razorpay_subscription(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. A one-time credit grant for a verified purchase.
-- ---------------------------------------------------------------------------
-- `add_user_credits` grants whatever it is handed, as many times as it is
-- called. The top-up route verified a Razorpay signature and then called it with
-- an amount taken from the request body, so a single genuine ₹1,000 payment
-- could be re-submitted for any amount, any number of times — the signature
-- covers `order_id|payment_id` and says nothing about how much was paid.
--
-- Anchoring the grant to the payment id makes the replay a no-op: the second
-- call finds the transaction and returns `granted = false`. The amount now comes
-- from the Razorpay order, which the route reads back from the API rather than
-- accepting from the caller.
--
-- Same shape as `grant_subscription_credits`, which already works this way.

create unique index if not exists credit_transactions_purchase_payment_idx
  on public.credit_transactions ((metadata->>'payment_id'))
  where type = 'purchase' and metadata ? 'payment_id';

create or replace function public.grant_purchased_credits(
  p_profile_id uuid,
  p_amount integer,
  p_payment_id text,
  p_description text default 'Credit purchase'
)
returns table (granted boolean, new_balance integer)
language plpgsql security definer set search_path = public as $$
declare
  updated_balance integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Purchased credits can only be granted by the server';
  end if;
  if p_profile_id is null then raise exception 'A profile is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Credit amount must be positive'; end if;
  if p_payment_id is null or btrim(p_payment_id) = '' then raise exception 'A payment reference is required'; end if;

  -- Lock the profile so two deliveries of the same payment cannot both pass the
  -- existence check before either has written its transaction.
  perform 1 from public.profiles where id = p_profile_id for update;

  if exists (
    select 1 from public.credit_transactions
    where type = 'purchase' and metadata->>'payment_id' = p_payment_id
  ) then
    select coalesce(credits_balance, 0) into updated_balance from public.profiles where id = p_profile_id;
    return query select false, coalesce(updated_balance, 0);
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
    'purchase',
    p_description,
    jsonb_build_object('payment_id', p_payment_id)
  );

  return query select true, updated_balance;
end;
$$;

revoke execute on function public.grant_purchased_credits(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.grant_purchased_credits(uuid, integer, text, text) to service_role;
