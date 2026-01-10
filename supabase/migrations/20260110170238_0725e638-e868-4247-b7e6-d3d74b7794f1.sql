-- ============================================================
-- FASE 18.2 — LANÇAMENTO CONTROLADO DE PRODUÇÃO
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_production_for_planned_house(
  p_service_plan_id uuid,
  p_house_id uuid,
  p_execution_date date,
  p_quantity integer,
  p_cost numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alloc RECORD;
  v_sp RECORD;
BEGIN
  SELECT * INTO v_sp
  FROM service_planning_by_period
  WHERE id = p_service_plan_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'service_plan_not_found');
  END IF;

  SELECT * INTO v_alloc
  FROM service_house_allocations
  WHERE service_plan_id = p_service_plan_id
    AND house_id = p_house_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'house_not_allocated_to_service_period');
  END IF;

  INSERT INTO production_logs (
    company_id,
    project_id,
    service_id,
    measurement_id,
    planning_period_id,
    service_plan_id,
    house_id,
    execution_date,
    quantity_executed,
    cost_realized,
    is_initial_database
  )
  VALUES (
    v_sp.company_id,
    v_sp.project_id,
    NULL,
    NULL,
    v_sp.planning_period_id,
    p_service_plan_id,
    p_house_id,
    p_execution_date,
    p_quantity,
    p_cost,
    false
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_production_for_planned_house(uuid, uuid, date, integer, numeric)
TO authenticated;