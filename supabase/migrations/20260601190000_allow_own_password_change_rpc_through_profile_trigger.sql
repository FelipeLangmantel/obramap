-- Allow the mandatory password-change flow to clear only the caller's own
-- must_change_password flag without weakening profile privilege protections.

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_system_admin boolean := false;
  v_is_company_admin boolean := false;
BEGIN
  -- Allow service_role and superusers to bypass entirely (admin tools, edge fns).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (system_role = 'system_admin'), (system_role = 'admin')
    INTO v_is_system_admin, v_is_company_admin
  FROM public.profiles
  WHERE user_id = auth.uid();

  -- System admins can change anything.
  IF COALESCE(v_is_system_admin, false) THEN
    RETURN NEW;
  END IF;

  -- Company admins can change other profiles in their own company,
  -- but cannot promote anyone to system_admin.
  IF COALESCE(v_is_company_admin, false) THEN
    IF NEW.system_role = 'system_admin' AND OLD.system_role IS DISTINCT FROM 'system_admin' THEN
      RAISE EXCEPTION 'Not allowed to grant system_admin role';
    END IF;
    RETURN NEW;
  END IF;

  -- Regular users cannot alter identity, permission, company, or status fields.
  IF NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'Cannot change user_id';
  END IF;
  IF NEW.system_role IS DISTINCT FROM OLD.system_role THEN
    RAISE EXCEPTION 'Not allowed to change system_role';
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Not allowed to change company_id';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Not allowed to change status';
  END IF;

  -- The only permitted change to must_change_password for a regular user is
  -- clearing their own flag through public.mark_own_password_changed().
  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password THEN
    IF NOT (
      OLD.user_id = auth.uid()
      AND OLD.must_change_password IS TRUE
      AND NEW.must_change_password IS FALSE
      AND current_setting('app.mark_own_password_changed', true) = 'on'
    ) THEN
      RAISE EXCEPTION 'Not allowed to change must_change_password';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_own_password_changed()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_has_password_changed_at boolean := false;
  v_has_updated_at boolean := false;
  v_sql text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT id
    INTO v_profile_id
    FROM public.profiles
   WHERE user_id = v_user_id;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  PERFORM set_config('app.mark_own_password_changed', 'on', true);

  SELECT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'profiles'
       AND column_name = 'password_changed_at'
  ) INTO v_has_password_changed_at;

  SELECT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'profiles'
       AND column_name = 'updated_at'
  ) INTO v_has_updated_at;

  v_sql := 'UPDATE public.profiles SET must_change_password = false';

  IF v_has_password_changed_at THEN
    v_sql := v_sql || ', password_changed_at = now()';
  END IF;

  IF v_has_updated_at THEN
    v_sql := v_sql || ', updated_at = now()';
  END IF;

  v_sql := v_sql || ' WHERE user_id = $1';
  EXECUTE v_sql USING v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mark_own_password_changed() TO authenticated;
