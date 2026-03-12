
CREATE OR REPLACE FUNCTION public.sync_period_services_with_strategic(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
  updated_count integer;
BEGIN
  -- 1. Delete orphaned service_planning_by_period records 
  --    where the macro_id+scope_id no longer exists in project_contract_services
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
  --    to keep period planning in sync
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

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', deleted_count,
    'updated_count', updated_count
  );
END;
$$;
