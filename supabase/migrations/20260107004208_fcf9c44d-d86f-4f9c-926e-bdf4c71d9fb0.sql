-- Function to promote an existing user to SYSTEM_ADMIN by email
CREATE OR REPLACE FUNCTION public.promote_to_system_admin(admin_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_user_id uuid;
  found_profile_id uuid;
BEGIN
  -- Check if admin already exists
  IF EXISTS (SELECT 1 FROM public.profiles WHERE system_role = 'system_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'System admin already exists', 'code', 'ADMIN_EXISTS');
  END IF;
  
  -- Find user by email in profiles
  SELECT user_id, id INTO found_user_id, found_profile_id
  FROM public.profiles
  WHERE email = admin_email
  LIMIT 1;
  
  IF found_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found', 'code', 'USER_NOT_FOUND');
  END IF;
  
  -- Promote user to system_admin
  UPDATE public.profiles
  SET 
    system_role = 'system_admin',
    status = 'active',
    must_change_password = false
  WHERE user_id = found_user_id;
  
  RETURN jsonb_build_object('success', true, 'user_id', found_user_id);
END;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION public.promote_to_system_admin(text) TO anon;
GRANT EXECUTE ON FUNCTION public.promote_to_system_admin(text) TO authenticated;