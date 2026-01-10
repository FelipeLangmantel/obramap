-- ============================================================
-- FASE 17.2 — RPC PARA ALOCAR CASA AO SERVIÇO DO PERÍODO
-- ============================================================
CREATE OR REPLACE FUNCTION public.allocate_house_to_service_period(
  p_service_plan_id uuid,
  p_house_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sp RECORD;
  v_house RECORD;
  v_count integer;
BEGIN
  SELECT * INTO v_sp
  FROM service_planning_by_period
  WHERE id = p_service_plan_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'service_plan_not_found');
  END IF;

  SELECT * INTO v_house
  FROM houses
  WHERE id = p_house_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'house_not_found');
  END IF;

  -- Impedir casa já alocada neste serviço
  IF EXISTS (
    SELECT 1 FROM service_house_allocations
    WHERE house_id = p_house_id
      AND macro_id = v_sp.macro_id
      AND scope_id = v_sp.scope_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'house_already_allocated_for_service');
  END IF;

  -- Impedir exceder meta do serviço
  SELECT COUNT(*) INTO v_count
  FROM service_house_allocations
  WHERE service_plan_id = p_service_plan_id;

  IF v_count >= v_sp.target_houses THEN
    RETURN jsonb_build_object('success', false, 'error', 'service_target_already_fulfilled');
  END IF;

  INSERT INTO service_house_allocations (
    company_id,
    project_id,
    planning_period_id,
    service_plan_id,
    house_id,
    macro_id,
    scope_id
  )
  VALUES (
    v_sp.company_id,
    v_sp.project_id,
    v_sp.planning_period_id,
    p_service_plan_id,
    p_house_id,
    v_sp.macro_id,
    v_sp.scope_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_house_to_service_period(uuid, uuid) TO authenticated;