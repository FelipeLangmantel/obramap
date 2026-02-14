
CREATE OR REPLACE FUNCTION add_planning_period(
  p_project_id uuid,
  p_company_id uuid,
  p_planning_version_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_period_id uuid;
  v_last_period_number integer;
  v_last_end_date date;
  v_last_period_id uuid;
BEGIN
  SELECT 
    COALESCE(MAX(period_number), 0),
    COALESCE(MAX(end_date::date), CURRENT_DATE)
  INTO v_last_period_number, v_last_end_date
  FROM planning_periods
  WHERE planning_version_id = p_planning_version_id;

  SELECT id INTO v_last_period_id
  FROM planning_periods
  WHERE planning_version_id = p_planning_version_id
  ORDER BY period_number DESC
  LIMIT 1;

  INSERT INTO planning_periods (
    company_id, project_id, planning_version_id,
    period_number, start_date, end_date, status
  )
  VALUES (
    p_company_id,
    p_project_id,
    p_planning_version_id,
    v_last_period_number + 1,
    v_last_end_date + 1,
    v_last_end_date + 30,
    'draft'
  )
  RETURNING id INTO v_new_period_id;

  IF v_last_period_id IS NOT NULL THEN
    INSERT INTO service_planning_by_period (
      company_id, project_id, contract_id, planning_period_id,
      macro_id, scope_id, macro_name, scope_name,
      unit_cost_value, unit_revenue_value, target_houses,
      planned_cost, planned_revenue, projected_result, status
    )
    SELECT
      company_id, project_id, contract_id, v_new_period_id,
      macro_id, scope_id, macro_name, scope_name,
      unit_cost_value, unit_revenue_value, 0, 0, 0, 0, 'draft'
    FROM service_planning_by_period
    WHERE planning_period_id = v_last_period_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'period_id', v_new_period_id,
    'period_number', v_last_period_number + 1
  );
END;
$$;
