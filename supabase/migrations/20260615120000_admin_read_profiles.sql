-- Allow admins to read all profiles (for admin Students panel)
CREATE POLICY "admins can read all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid())
);
