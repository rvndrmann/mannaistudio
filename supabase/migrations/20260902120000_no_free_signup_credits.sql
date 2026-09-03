-- Stop handing new accounts 100 credits they were never meant to get.
--
-- `signup_credits` in site_settings has been `enabled: false` for a while, so
-- the intent was already that nobody gets a free balance. That switch only ever
-- governed the *bonus* grant in `grant_signup_credits`. The 100 credits were
-- coming from somewhere else entirely: `profiles.credits_balance` is declared
-- `DEFAULT 100`, and `handle_new_user` inserts a profile without naming that
-- column, so every sign-up took the default and arrived with 100 credits. The
-- setting said off and the product said yes.
--
-- Three functions repeat the same figure as a fallback, and each is a different
-- way for it to come back:
--
--   add_user_credits    — creating a profile during a purchase added 100 on top
--                         of what was bought.
--   deduct_user_credits — a charge against a missing profile created one with
--                         100 and spent from it.
--   get_user_credits    — a missing profile *read* as 100, so the badge showed
--                         a balance that no row backed.
--
-- Existing balances are deliberately left alone. People who already hold these
-- credits were given them by the product as it behaved at the time, and taking
-- them back now would be a worse surprise than having granted them.

alter table public.profiles alter column credits_balance set default 0;

-- ---------------------------------------------------------------------------
-- Same bodies as 20260821120000_lock_down_value_granting_rpcs.sql, including
-- the identity checks; only the fallback figure changes.
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
    -- Exactly what was paid for, with nothing added on top.
    INSERT INTO profiles (id, credits_balance)
    VALUES (p_user_id, p_amount)
    RETURNING credits_balance INTO updated_bal;
  END IF;

  INSERT INTO credit_transactions (profile_id, amount, balance_after, type, description)
  VALUES (p_user_id, p_amount, updated_bal, p_type, p_description);

  RETURN updated_bal;
END;
$$;

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
  -- No profile row means no credits, and saying so is the honest answer.
  RETURN COALESCE(bal, 0);
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
    INSERT INTO profiles (id, credits_balance) VALUES (p_user_id, 0)
    ON CONFLICT (id) DO NOTHING;
    current_bal := 0;
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
