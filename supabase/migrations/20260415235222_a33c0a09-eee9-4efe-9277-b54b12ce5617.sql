
-- Function to reset a user's password to a new temporary one
-- Returns the generated temp password so the admin can share it
CREATE OR REPLACE FUNCTION public.reset_user_temp_password(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_temp_password text;
  v_caller_company_id uuid;
  v_target_company_id uuid;
BEGIN
  -- Verify the caller is an admin of the same company
  SELECT company_id INTO v_caller_company_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  SELECT company_id INTO v_target_company_id
  FROM public.profiles
  WHERE user_id = p_user_id;

  IF v_caller_company_id IS NULL OR v_caller_company_id != v_target_company_id THEN
    RAISE EXCEPTION 'Sem permissao para redefinir senha deste usuario';
  END IF;

  -- Check caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Apenas administradores podem redefinir senhas';
  END IF;

  -- Generate temp password
  v_temp_password := public.generate_temp_password();

  -- Update auth.users password
  UPDATE auth.users
  SET encrypted_password = crypt(v_temp_password, gen_salt('bf'))
  WHERE id = p_user_id;

  -- Mark must_change_password
  UPDATE public.profiles
  SET must_change_password = true
  WHERE user_id = p_user_id;

  RETURN v_temp_password;
END;
$$;
