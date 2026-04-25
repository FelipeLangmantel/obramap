CREATE OR REPLACE FUNCTION public.is_coordenador_or_admin(_user_id uuid, _project_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = _user_id
      AND p.system_role::text IN ('system_admin','admin','coordenador')
  )
  OR (
    _project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.projects pr
      WHERE pr.id = _project_id AND pr.coordenador_user_id = _user_id
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_block_unauthorized_regression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_project_id uuid;
  v_is_priv boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(NEW.percentual_executado,0) >= COALESCE(OLD.percentual_executado,0) THEN
    RETURN NEW;
  END IF;

  SELECT de.project_id INTO v_project_id
  FROM public.diary_entries de
  WHERE de.id = NEW.diary_entry_id;

  v_is_priv := public.is_coordenador_or_admin(v_user, v_project_id);

  IF v_is_priv THEN
    NEW.regression_approved_by := v_user;
    NEW.regression_approved_at := now();
    RETURN NEW;
  END IF;

  IF NEW.regression_reason IS NULL OR length(trim(NEW.regression_reason)) < 5 THEN
    RAISE EXCEPTION 'Regressão de percentual exige justificativa de no mínimo 5 caracteres (campo regression_reason).';
  END IF;

  RETURN NEW;
END;
$$;