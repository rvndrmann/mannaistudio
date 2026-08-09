-- Migration: Add site_features to site_settings table and RPC for pausing features (Calendar, Analytics, Ads Manager, Competitors)

INSERT INTO site_settings (key, value)
VALUES ('site_features', '{"calendar": true, "analytics": true, "ads": true, "competitors": true, "social": true, "courses": true, "blog": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Security Definer function to allow admins to update feature flags
CREATE OR REPLACE FUNCTION admin_update_site_features(p_features jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO site_settings (key, value)
  VALUES ('site_features', p_features)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  RETURN p_features;
END;
$$;
