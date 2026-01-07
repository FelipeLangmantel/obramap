-- Create admin function to create company (bypasses RLS)
CREATE OR REPLACE FUNCTION public.admin_create_company(company_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_slug text;
  new_company_id uuid;
  result jsonb;
BEGIN
  -- Verify caller is a system_admin
  IF NOT public.is_system_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only system admins can create companies', 'code', 'UNAUTHORIZED');
  END IF;
  
  -- Check for duplicate name
  IF EXISTS (SELECT 1 FROM public.companies WHERE LOWER(name) = LOWER(company_name)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Company name already exists', 'code', 'DUPLICATE_NAME');
  END IF;
  
  -- Generate unique slug
  new_slug := public.generate_unique_slug(company_name);
  
  -- Create company
  INSERT INTO public.companies (name, slug)
  VALUES (company_name, new_slug)
  RETURNING id INTO new_company_id;
  
  -- Return success with company data
  SELECT jsonb_build_object(
    'success', true,
    'company', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'slug', c.slug
    )
  ) INTO result
  FROM public.companies c
  WHERE c.id = new_company_id;
  
  RETURN result;
END;
$$;

-- Update promote_to_system_admin to handle ADMIN_EXISTS error code better
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
  -- Check if admin already exists - return specific code
  IF EXISTS (SELECT 1 FROM public.profiles WHERE system_role = 'system_admin' AND status = 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'System admin already exists', 'code', 'ADMIN_EXISTS');
  END IF;
  
  -- Find user by email in profiles
  SELECT user_id, id INTO found_user_id, found_profile_id
  FROM public.profiles
  WHERE LOWER(email) = LOWER(admin_email)
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