-- ============================================================
-- FASE 14.2 — GERAR NECESSIDADES DE INSUMOS POR PERÍODO
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_period_supply_requirements(
  p_planning_period_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period RECORD;
  v_count integer := 0;
BEGIN
  -- Buscar período
  SELECT * INTO v_period
  FROM planning_periods
  WHERE id = p_planning_period_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'period_not_found');
  END IF;

  -- Limpar necessidades antigas do período
  DELETE FROM period_supply_requirements
  WHERE planning_period_id = p_planning_period_id;

  -- Gerar novas necessidades a partir do planejamento por serviço
  INSERT INTO period_supply_requirements (
    company_id,
    project_id,
    planning_period_id,
    service_plan_id,
    macro_id,
    scope_id,
    input_id,
    input_name,
    unit,
    quantity_required
  )
  SELECT
    sp.company_id,
    sp.project_id,
    sp.planning_period_id,
    sp.id,
    sp.macro_id,
    sp.scope_id,
    bi.input_id,
    i.name,
    i.unit,
    (bi.quantity_per_unit * sp.target_houses) AS quantity_required
  FROM service_planning_by_period sp
  JOIN budget_service_inputs bi
    ON bi.macro_id = sp.macro_id
   AND bi.scope_id = sp.scope_id
  JOIN inputs i ON i.id = bi.input_id
  WHERE sp.planning_period_id = p_planning_period_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'items_generated', v_count
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.generate_period_supply_requirements(uuid) TO authenticated;