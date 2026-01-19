-- Create RPC for transactional period approval
CREATE OR REPLACE FUNCTION approve_planning_period(
  p_period_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period record;
  v_measurement_id uuid;
  v_measurement_number integer;
BEGIN
  -- Fetch period data
  SELECT * INTO v_period
  FROM planning_periods
  WHERE id = p_period_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'period_not_found');
  END IF;
  
  -- Check if already approved
  IF v_period.status IN ('approved', 'executing', 'closed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'period_already_approved');
  END IF;
  
  -- Update period status to approved
  UPDATE planning_periods
  SET status = 'approved',
      updated_at = now()
  WHERE id = p_period_id;
  
  -- Check if measurement already exists for this period
  SELECT id INTO v_measurement_id
  FROM measurements
  WHERE planning_period_id = p_period_id
  LIMIT 1;
  
  IF v_measurement_id IS NULL THEN
    -- Get next measurement number for this project
    SELECT COALESCE(MAX(measurement_number), 0) + 1 INTO v_measurement_number
    FROM measurements
    WHERE project_id = v_period.project_id;
    
    -- Create measurement linked to this period
    INSERT INTO measurements (
      project_id,
      company_id,
      measurement_number,
      start_date,
      end_date,
      status,
      type,
      planning_period_id,
      revenue_target,
      planned_cost,
      revenue_expected
    )
    VALUES (
      v_period.project_id,
      v_period.company_id,
      v_measurement_number,
      v_period.start_date,
      v_period.end_date,
      'planned',
      'PLANNED',
      p_period_id,
      v_period.target_revenue_total,
      v_period.planned_cost_total,
      v_period.revenue_expected
    )
    RETURNING id INTO v_measurement_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'measurement_id', v_measurement_id,
    'period_id', p_period_id
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION approve_planning_period(uuid, uuid) TO authenticated;