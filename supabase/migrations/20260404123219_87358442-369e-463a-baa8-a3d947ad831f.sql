
-- The policy was already dropped in previous migration, but ensure it's gone
DROP POLICY IF EXISTS "System admin can manage system_modules" ON public.system_modules;

-- Drop the broken plpgsql no-arg overload (oid 239579)
-- The correct version is is_system_admin(_user_id uuid DEFAULT auth.uid()) which stays
DROP FUNCTION IF EXISTS public.is_system_admin() CASCADE;

-- Re-create the policy using the remaining correct overload
CREATE POLICY "System admin can manage system_modules" ON public.system_modules FOR ALL TO authenticated
  USING (public.is_system_admin(auth.uid()))
  WITH CHECK (public.is_system_admin(auth.uid()));
