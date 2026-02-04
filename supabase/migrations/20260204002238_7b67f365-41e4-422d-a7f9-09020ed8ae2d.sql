-- Fix is_system_admin function to use user_id column instead of id
CREATE OR REPLACE FUNCTION public.is_system_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id
      AND system_role = 'system_admin'
      AND status = 'active'
  )
$$;