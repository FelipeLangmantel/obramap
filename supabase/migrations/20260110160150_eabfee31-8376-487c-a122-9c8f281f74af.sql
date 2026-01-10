-- ============================================================
-- FASE 13.5 — GERAR PLANEJAMENTO DO PERÍODO A PARTIR DO ORÇAMENTO
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_service_planning_for_period(
  p_company_id uuid,
  p_project_id uuid,
  p_contract_id uuid,
  p_planning_period_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- Remove planejamento existente do período (regeneração controlada)
  DELETE FROM service_planning_by_period
  WHERE planning_period_id = p_planning_period_id;

  -- Inserir serviços a partir do orçamento (measurement_services como base)
  -- Calcula unit_cost e unit_revenue a partir de planned_cost/planned_houses
  INSERT INTO service_planning_by_period (
    company_id,
    project_id,
    contract_id,
    planning_period_id,
    macro_id,
    scope_id,
    macro_name,
    scope_name,
    target_houses,
    unit_cost_value,
    unit_revenue_value
  )
  SELECT DISTINCT ON (ms.macro_id, ms.scope_id)
    ms.company_id,
    ms.project_id,
    p_contract_id,
    p_planning_period_id,
    ms.macro_id::uuid,
    ms.scope_id::uuid,
    ms.macro_name,
    ms.scope_name,
    0 AS target_houses,
    -- Calcula custo unitário: planned_cost / planned_houses (evita divisão por zero)
    CASE 
      WHEN COALESCE(ms.planned_houses, 0) > 0 
      THEN COALESCE(ms.planned_cost, 0) / ms.planned_houses
      ELSE 0
    END AS unit_cost_value,
    -- Revenue unitário pode vir de productivity_expected ou ser calculado depois
    0 AS unit_revenue_value
  FROM measurement_services ms
  JOIN measurements m ON m.id = ms.measurement_id
  WHERE m.project_id = p_project_id
    AND m.company_id = p_company_id
  ORDER BY ms.macro_id, ms.scope_id, ms.created_at DESC;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'rows_created', v_count
  );
END;
$$;

-- Permitir que usuários autenticados executem a função
GRANT EXECUTE ON FUNCTION public.generate_service_planning_for_period(uuid, uuid, uuid, uuid) TO authenticated;