
-- 1) ple_glosses: drop permissive SELECT, add company-scoped one
DROP POLICY IF EXISTS "Users can view glosses" ON public.ple_glosses;
CREATE POLICY "Users can view glosses of their company"
  ON public.ple_glosses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ple_projects p
      WHERE p.id = ple_glosses.ple_project_id
        AND p.company_id = public.get_my_company_id()
    )
  );

-- 2) measurement_stock_entries: scope INSERT/UPDATE to user's company
DROP POLICY IF EXISTS "Authenticated users can insert measurement stock entries" ON public.measurement_stock_entries;
DROP POLICY IF EXISTS "Authenticated users can update measurement stock entries" ON public.measurement_stock_entries;

CREATE POLICY "Company users can insert measurement_stock_entries"
  ON public.measurement_stock_entries FOR INSERT TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()
    )
  );

CREATE POLICY "Company users can update measurement_stock_entries"
  ON public.measurement_stock_entries FOR UPDATE TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()
    )
  );

-- 3) user_sessions: scope admin policies to admins of the same company.
DROP POLICY IF EXISTS "Admins can view all sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Admins can manage sessions" ON public.user_sessions;

CREATE POLICY "Admins can view sessions of their company"
  ON public.user_sessions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.profiles me   ON me.user_id   = auth.uid()
      JOIN public.profiles them ON them.user_id = user_sessions.user_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'::app_role
        AND me.company_id IS NOT NULL
        AND me.company_id = them.company_id
    )
  );

CREATE POLICY "Admins can manage sessions of their company"
  ON public.user_sessions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.profiles me   ON me.user_id   = auth.uid()
      JOIN public.profiles them ON them.user_id = user_sessions.user_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'::app_role
        AND me.company_id IS NOT NULL
        AND me.company_id = them.company_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.profiles me   ON me.user_id   = auth.uid()
      JOIN public.profiles them ON them.user_id = user_sessions.user_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'::app_role
        AND me.company_id IS NOT NULL
        AND me.company_id = them.company_id
    )
  );

-- 4) promote_to_system_admin: revoke anon, require an authenticated caller.
REVOKE EXECUTE ON FUNCTION public.promote_to_system_admin(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.promote_to_system_admin(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.promote_to_system_admin(admin_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  found_user_id uuid;
  found_profile_id uuid;
BEGIN
  -- SECURITY: reject unauthenticated callers (defense in depth on top of revoked anon EXECUTE)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- Check if admin already exists - return specific code
  IF EXISTS (SELECT 1 FROM public.profiles WHERE system_role = 'system_admin' AND status = 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'System admin already exists', 'code', 'ADMIN_EXISTS');
  END IF;

  SELECT user_id, id INTO found_user_id, found_profile_id
  FROM public.profiles
  WHERE LOWER(email) = LOWER(admin_email)
  LIMIT 1;

  IF found_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found', 'code', 'USER_NOT_FOUND');
  END IF;

  UPDATE public.profiles
  SET
    system_role = 'system_admin',
    status = 'active',
    must_change_password = false
  WHERE user_id = found_user_id;

  RETURN jsonb_build_object('success', true, 'user_id', found_user_id);
END;
$function$;
