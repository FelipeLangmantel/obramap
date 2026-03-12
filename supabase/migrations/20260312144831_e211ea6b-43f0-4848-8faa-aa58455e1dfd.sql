
CREATE OR REPLACE FUNCTION public.sync_period_services_with_strategic(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
  updated_count integer;
  inserted_count integer;
BEGIN
  -- 1. Delete orphaned service_planning_by_period records 
  DELETE FROM service_planning_by_period spbp
  WHERE spbp.project_id = p_project_id
    AND NOT EXISTS (
      SELECT 1 FROM project_contract_services pcs
      WHERE pcs.project_id = p_project_id
        AND pcs.macro_id = spbp.macro_id
        AND pcs.scope_id = spbp.scope_id
    );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- 2. Update names and financial values from project_contract_services 
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
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- 3. Insert missing services for all periods
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
      SELECT 1 FROM service_planning_by_period existing
      WHERE existing.planning_period_id = pp.id
        AND existing.macro_id = pcs.macro_id
        AND existing.scope_id = pcs.scope_id
    )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', deleted_count,
    'updated_count', updated_count,
    'inserted_count', inserted_count
  );
END;
$$;
