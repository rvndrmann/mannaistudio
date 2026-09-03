-- Make "no free credits" actually true.
--
-- `site_settings.signup_credits` has been `enabled: false` for a while, but
-- that switch only governs the bonus grant in `grant_signup_credits`. The
-- starting balance came from somewhere else entirely: `profiles.credits_balance`
-- is declared `DEFAULT 100`, and three functions hardcode the same 100 when
-- they meet a profile row that does not exist yet. So every new account opened
-- with 100 credits no matter what the setting said, and the switch looked like
-- it was off while the credits kept going out.
--
-- The default and those three literals are the actual policy. They move to 0
-- together; the setting stays as the way to turn a starter grant back on,
-- which is what it was for.
--
-- Existing balances are deliberately untouched — this changes what new accounts
-- start with, not what anyone currently holds.

alter table public.profiles alter column credits_balance set default 0;

-- `get_user_credits`: a profile with no row reads as 0, not as 100 it does not
-- have. The old fallback reported credits that no balance backed, so a caller
-- could be told it had 100 and then be refused at the point of spending.
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
  RETURN COALESCE(bal, 0);
END;
$$;

-- `deduct_user_credits`: auto-creating a profile mid-charge must not mint the
-- balance it is about to spend from. At 0 the insufficient-credits branch below
-- catches it, which is the correct answer for an account that has bought
-- nothing.
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

-- `add_user_credits`: a purchase for a profile that does not exist yet was
-- granting the amount paid for plus 100. Someone who bought 1,000 credits
-- before their row existed received 1,100.
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
    INSERT INTO profiles (id, credits_balance)
    VALUES (p_user_id, p_amount)
    RETURNING credits_balance INTO updated_bal;
  END IF;

  INSERT INTO credit_transactions (profile_id, amount, balance_after, type, description)
  VALUES (p_user_id, p_amount, updated_bal, p_type, p_description);

  RETURN updated_bal;
END;
$$;
