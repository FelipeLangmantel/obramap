-- RPC segura para concluir a troca obrigatória de senha.
-- Escopo: somente o usuário autenticado pode limpar o próprio must_change_password.
-- Não altera permissões, company_id, system_role, status, email, nome ou dados de outros usuários.

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
