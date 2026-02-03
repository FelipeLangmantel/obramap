-- Update the is_system_admin function to use system_role column (using original parameter name)
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
    WHERE id = _user_id
      AND system_role = 'system_admin'
      AND status = 'active'
  )
$$;

-- Drop and recreate policies on system_modules
DROP POLICY IF EXISTS "Authenticated users can read system modules" ON public.system_modules;
DROP POLICY IF EXISTS "Only system admins can modify system modules" ON public.system_modules;

CREATE POLICY "Authenticated users can read system modules"
ON public.system_modules
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Only system admins can modify system modules"
ON public.system_modules
FOR ALL
TO authenticated
USING (public.is_system_admin(auth.uid()))
WITH CHECK (public.is_system_admin(auth.uid()));

-- Drop and recreate policies on company_modules
DROP POLICY IF EXISTS "System admins can manage all company modules" ON public.company_modules;
DROP POLICY IF EXISTS "Users can view their own company's modules" ON public.company_modules;
DROP POLICY IF EXISTS "Company members can read modules" ON public.company_modules;
DROP POLICY IF EXISTS "Company members can read their modules" ON public.company_modules;

ALTER TABLE public.company_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admins can manage all company modules"
ON public.company_modules
FOR ALL
TO authenticated
USING (public.is_system_admin(auth.uid()))
WITH CHECK (public.is_system_admin(auth.uid()));

CREATE POLICY "Company members can read their modules"
ON public.company_modules
FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  )
);