-- Migration: Add Credit System (1,000 Credits = $10 USD)
-- Charging 2x API cost for each AI model

-- 1. Add credits_balance column to profiles table if not exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credits_balance INT NOT NULL DEFAULT 100;

-- 2. Create credit_transactions table
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  balance_after INT NOT NULL,
  type TEXT NOT NULL DEFAULT 'generation',
  model TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies for credit_transactions
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own credit transactions" ON credit_transactions;

CREATE POLICY "Users can view own credit transactions"
  ON credit_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = profile_id);

-- 3. SECURITY DEFINER function to deduct user credits atomically
CREATE OR REPLACE FUNCTION deduct_user_credits(
  p_user_id UUID,
  p_amount INT,
  p_model TEXT DEFAULT NULL,
  p_description TEXT DEFAULT 'AI Generation'
) RETURNS TABLE (
  success BOOLEAN,
  new_balance INT,
  error_message TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  current_bal INT;
BEGIN
  -- Lock row for update
  SELECT credits_balance INTO current_bal FROM profiles WHERE id = p_user_id FOR UPDATE;
  
  IF current_bal IS NULL THEN
    -- Auto-create profile if missing
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

-- 4. SECURITY DEFINER function to add user credits atomically
CREATE OR REPLACE FUNCTION add_user_credits(
  p_user_id UUID,
  p_amount INT,
  p_type TEXT DEFAULT 'purchase',
  p_description TEXT DEFAULT 'Credit Top Up'
) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  updated_bal INT;
BEGIN
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

-- 5. Helper function to get user credits
CREATE OR REPLACE FUNCTION get_user_credits(p_user_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  bal INT;
BEGIN
  SELECT credits_balance INTO bal FROM profiles WHERE id = p_user_id;
  RETURN COALESCE(bal, 100);
END;
$$;
