-- Correção definitiva de órfãos entre Estratégico -> Período -> Semanal
-- 1) Função de sincronização reforçada (remove órfãos também no weekly_plan_services)
CREATE OR REPLACE FUNCTION public.sync_period_services_with_strategic(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_period_count integer;
  deleted_weekly_count integer;
  updated_count integer;
  inserted_count integer;
BEGIN
  -- Remove órfãos do planejamento por período
  DELETE FROM service_planning_by_period spbp
  WHERE spbp.project_id = p_project_id
    AND NOT EXISTS (
      SELECT 1 FROM project_contract_services pcs
      WHERE pcs.project_id = p_project_id
        AND pcs.macro_id = spbp.macro_id
        AND pcs.scope_id = spbp.scope_id
    );
  GET DIAGNOSTICS deleted_period_count = ROW_COUNT;

  -- Remove órfãos do planejamento semanal
  DELETE FROM weekly_plan_services wps
  WHERE wps.project_id = p_project_id
    AND NOT EXISTS (
      SELECT 1 FROM project_contract_services pcs
      WHERE pcs.project_id = p_project_id
        AND pcs.macro_id = wps.macro_id
        AND pcs.scope_id = wps.scope_id
    );
  GET DIAGNOSTICS deleted_weekly_count = ROW_COUNT;

  -- Atualiza nomes e valores conforme contrato estratégico
  UPDATE service_planning_by_period spbp
  SET
    macro_name = pcs.macro_name,
    scope_name = pcs.scope_name,
    unit_cost_value = pcs.max_cost_value,
    unit_revenue_value = pcs.unit_revenue_value,
    planned_cost = spbp.target_houses * pcs.max_cost_value,
    planned_revenue = spbp.target_houses * pcs.unit_revenue_value,
    projected_result = spbp.target_houses * (pcs.unit_revenue_value - pcs.max_cost_value),
    updated_at = now()
  FROM project_contract_services pcs
  WHERE spbp.project_id = p_project_id
    AND pcs.project_id = p_project_id
    AND pcs.macro_id = spbp.macro_id
    AND pcs.scope_id = spbp.scope_id
    AND (
      spbp.macro_name IS DISTINCT FROM pcs.macro_name
      OR spbp.scope_name IS DISTINCT FROM pcs.scope_name
      OR spbp.unit_cost_value IS DISTINCT FROM pcs.max_cost_value
      OR spbp.unit_revenue_value IS DISTINCT FROM pcs.unit_revenue_value
      OR spbp.planned_cost IS DISTINCT FROM (spbp.target_houses * pcs.max_cost_value)
      OR spbp.planned_revenue IS DISTINCT FROM (spbp.target_houses * pcs.unit_revenue_value)
      OR spbp.projected_result IS DISTINCT FROM (spbp.target_houses * (pcs.unit_revenue_value - pcs.max_cost_value))
    );
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Garante serviços faltantes em todos os períodos
  INSERT INTO service_planning_by_period (
    planning_period_id, project_id, company_id, macro_id, scope_id,
    macro_name, scope_name, target_houses,
    unit_cost_value, unit_revenue_value,
    planned_cost, planned_revenue, projected_result
  )
  SELECT
    pp.id,
    pp.project_id,
    pp.company_id,
    pcs.macro_id,
    pcs.scope_id,
    pcs.macro_name,
    pcs.scope_name,
    0,
    pcs.max_cost_value,
    pcs.unit_revenue_value,
    0, 0, 0
  FROM planning_periods pp
  CROSS JOIN project_contract_services pcs
  WHERE pp.project_id = p_project_id
    AND pcs.project_id = p_project_id
    AND NOT EXISTS (
      SELECT 1
      FROM service_planning_by_period existing
      WHERE existing.planning_period_id = pp.id
        AND existing.macro_id = pcs.macro_id
        AND existing.scope_id = pcs.scope_id
    )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_period_count', deleted_period_count,
    'deleted_weekly_count', deleted_weekly_count,
    'updated_count', updated_count,
    'inserted_count', inserted_count
  );
END;
$$;

-- 2) Trigger de integridade para impedir novos órfãos (nunca mais)
CREATE OR REPLACE FUNCTION public.validate_service_key_exists_in_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.project_id IS NULL OR NEW.macro_id IS NULL OR NEW.scope_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.project_contract_services pcs
    WHERE pcs.project_id = NEW.project_id
      AND pcs.macro_id = NEW.macro_id
      AND pcs.scope_id = NEW.scope_id
  ) THEN
    RAISE EXCEPTION 'Serviço inválido para o projeto (macro_id=%, scope_id=%). Atualize o Planejamento Estratégico antes de salvar.', NEW.macro_id, NEW.scope_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_spbp_service_key ON public.service_planning_by_period;
CREATE TRIGGER trg_validate_spbp_service_key
BEFORE INSERT OR UPDATE OF project_id, macro_id, scope_id
ON public.service_planning_by_period
FOR EACH ROW
EXECUTE FUNCTION public.validate_service_key_exists_in_contract();

DROP TRIGGER IF EXISTS trg_validate_wps_service_key ON public.weekly_plan_services;
CREATE TRIGGER trg_validate_wps_service_key
BEFORE INSERT OR UPDATE OF project_id, macro_id, scope_id
ON public.weekly_plan_services
FOR EACH ROW
EXECUTE FUNCTION public.validate_service_key_exists_in_contract();

-- 3) Higienização imediata da base atual
DO $$
DECLARE
  v_deleted_spbp integer;
  v_deleted_wps integer;
BEGIN
  DELETE FROM public.service_planning_by_period spbp
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.project_contract_services pcs
    WHERE pcs.project_id = spbp.project_id
      AND pcs.macro_id = spbp.macro_id
      AND pcs.scope_id = spbp.scope_id
  );
  GET DIAGNOSTICS v_deleted_spbp = ROW_COUNT;

  DELETE FROM public.weekly_plan_services wps
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.project_contract_services pcs
    WHERE pcs.project_id = wps.project_id
      AND pcs.macro_id = wps.macro_id
      AND pcs.scope_id = wps.scope_id
  );
  GET DIAGNOSTICS v_deleted_wps = ROW_COUNT;

  RAISE NOTICE 'Órfãos removidos: service_planning_by_period=% | weekly_plan_services=%', v_deleted_spbp, v_deleted_wps;
END;
$$;