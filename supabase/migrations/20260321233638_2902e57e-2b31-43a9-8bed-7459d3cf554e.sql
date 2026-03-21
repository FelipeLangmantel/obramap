-- Corrige trigger que bloqueava DELETE em service_planning_by_period (retornava NEW em DELETE)
CREATE OR REPLACE FUNCTION public.block_update_on_closed_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed boolean;
BEGIN
  SELECT COALESCE(is_closed, false) INTO v_closed
  FROM planning_periods
  WHERE id = COALESCE(NEW.planning_period_id, OLD.planning_period_id);

  IF v_closed THEN
    RAISE EXCEPTION 'Planning period is closed and cannot be modified';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- Higienização definitiva após correção do trigger
DELETE FROM public.service_planning_by_period spbp
WHERE NOT EXISTS (
  SELECT 1
  FROM public.project_contract_services pcs
  WHERE pcs.project_id = spbp.project_id
    AND pcs.macro_id = spbp.macro_id
    AND pcs.scope_id = spbp.scope_id
);

DELETE FROM public.weekly_plan_services wps
WHERE NOT EXISTS (
  SELECT 1
  FROM public.project_contract_services pcs
  WHERE pcs.project_id = wps.project_id
    AND pcs.macro_id = wps.macro_id
    AND pcs.scope_id = wps.scope_id
);