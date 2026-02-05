-- Create function to get supply requests grouped by measurement
CREATE OR REPLACE FUNCTION public.get_supply_requests_by_measurement(
  p_project_id uuid
)
RETURNS TABLE (
  measurement_id uuid,
  measurement_number integer,
  start_date date,
  end_date date,
  measurement_status text,
  total_items bigint,
  total_quantity numeric,
  total_value numeric,
  items_alert bigint,
  items_quoted bigint,
  items_ordered bigint,
  items_delivered bigint,
  percent_purchased numeric,
  supply_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id AS measurement_id,
    m.measurement_number,
    m.start_date,
    m.end_date,
    m.status AS measurement_status,
    COUNT(sr.id) AS total_items,
    COALESCE(SUM(sr.quantity), 0) AS total_quantity,
    COALESCE(SUM(sr.total_value), 0) AS total_value,
    COUNT(sr.id) FILTER (WHERE sr.status = 'alert') AS items_alert,
    COUNT(sr.id) FILTER (WHERE sr.status = 'quoted') AS items_quoted,
    COUNT(sr.id) FILTER (WHERE sr.status = 'ordered') AS items_ordered,
    COUNT(sr.id) FILTER (WHERE sr.status = 'delivered') AS items_delivered,
    CASE 
      WHEN COUNT(sr.id) = 0 THEN 0
      ELSE ROUND(
        (COUNT(sr.id) FILTER (WHERE sr.status IN ('ordered', 'delivered'))::numeric / COUNT(sr.id)::numeric) * 100, 
        1
      )
    END AS percent_purchased,
    CASE
      WHEN COUNT(sr.id) = 0 THEN 'empty'
      WHEN COUNT(sr.id) = COUNT(sr.id) FILTER (WHERE sr.status = 'delivered') THEN 'complete'
      WHEN COUNT(sr.id) FILTER (WHERE sr.status IN ('ordered', 'delivered')) > 0 THEN 'partial'
      WHEN COUNT(sr.id) FILTER (WHERE sr.status = 'quoted') > 0 THEN 'quoted'
      ELSE 'pending'
    END AS supply_status
  FROM measurements m
  LEFT JOIN supply_requests sr ON sr.measurement_id = m.id AND sr.status != 'cancelled'
  WHERE m.project_id = p_project_id
  GROUP BY m.id, m.measurement_number, m.start_date, m.end_date, m.status
  ORDER BY m.measurement_number DESC;
END;
$$;

-- Create function to get supply requests for a specific measurement
CREATE OR REPLACE FUNCTION public.get_measurement_supply_requests(
  p_project_id uuid,
  p_measurement_id uuid,
  p_status text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  item_id uuid,
  item_name text,
  item_unit text,
  quantity numeric,
  unit_value numeric,
  total_value numeric,
  status text,
  source_plan_id uuid,
  measurement_id uuid,
  family_id uuid,
  family_name text,
  family_color text,
  scope_id text,
  macro_id text,
  required_date date,
  order_by_date date,
  is_critical boolean,
  notes text,
  quotation_id uuid,
  purchase_order_id uuid,
  supplier_id uuid,
  supplier_name text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sr.id,
    sr.project_id,
    sr.item_id,
    sr.item_name,
    sr.item_unit,
    sr.quantity,
    sr.unit_value,
    sr.total_value,
    sr.status::text,
    sr.source_plan_id,
    sr.measurement_id,
    sr.family_id,
    mf.name AS family_name,
    mf.color AS family_color,
    sr.scope_id,
    sr.macro_id,
    sr.required_date,
    sr.order_by_date,
    sr.is_critical,
    sr.notes,
    sr.quotation_id,
    sr.purchase_order_id,
    sr.supplier_id,
    s.name AS supplier_name,
    sr.created_at,
    sr.updated_at
  FROM supply_requests sr
  LEFT JOIN material_families mf ON sr.family_id = mf.id
  LEFT JOIN suppliers s ON sr.supplier_id = s.id
  WHERE sr.project_id = p_project_id
    AND sr.measurement_id = p_measurement_id
    AND (p_status IS NULL OR sr.status::text = p_status)
    AND sr.status != 'cancelled'
  ORDER BY sr.is_critical DESC, sr.order_by_date ASC;
END;
$$;

-- Create function to get measurement supply KPIs
CREATE OR REPLACE FUNCTION public.get_measurement_supply_kpis(
  p_project_id uuid,
  p_measurement_id uuid
)
RETURNS TABLE (
  total_items bigint,
  total_quantity numeric,
  total_value numeric,
  items_alert bigint,
  items_quoted bigint,
  items_ordered bigint,
  items_delivered bigint,
  critical_items bigint,
  percent_purchased numeric,
  value_purchased numeric,
  value_pending numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(sr.id) AS total_items,
    COALESCE(SUM(sr.quantity), 0) AS total_quantity,
    COALESCE(SUM(sr.total_value), 0) AS total_value,
    COUNT(sr.id) FILTER (WHERE sr.status = 'alert') AS items_alert,
    COUNT(sr.id) FILTER (WHERE sr.status = 'quoted') AS items_quoted,
    COUNT(sr.id) FILTER (WHERE sr.status = 'ordered') AS items_ordered,
    COUNT(sr.id) FILTER (WHERE sr.status = 'delivered') AS items_delivered,
    COUNT(sr.id) FILTER (WHERE sr.is_critical = true AND sr.status NOT IN ('delivered', 'cancelled')) AS critical_items,
    CASE 
      WHEN COUNT(sr.id) = 0 THEN 0
      ELSE ROUND(
        (COUNT(sr.id) FILTER (WHERE sr.status IN ('ordered', 'delivered'))::numeric / COUNT(sr.id)::numeric) * 100, 
        1
      )
    END AS percent_purchased,
    COALESCE(SUM(sr.total_value) FILTER (WHERE sr.status IN ('ordered', 'delivered')), 0) AS value_purchased,
    COALESCE(SUM(sr.total_value) FILTER (WHERE sr.status IN ('alert', 'quoted')), 0) AS value_pending
  FROM supply_requests sr
  WHERE sr.project_id = p_project_id
    AND sr.measurement_id = p_measurement_id
    AND sr.status != 'cancelled';
END;
$$;

-- Update generate_supply_requests_from_planning to ensure measurement_id is always set
-- First, let's verify the existing function and update it
CREATE OR REPLACE FUNCTION public.generate_supply_requests_from_planning(
  p_project_id uuid,
  p_measurement_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted_count integer := 0;
  v_measurement_id uuid;
  v_company_id uuid;
BEGIN
  -- Get company_id from project
  SELECT company_id INTO v_company_id
  FROM projects
  WHERE id = p_project_id;
  
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Projeto não encontrado');
  END IF;

  -- If specific measurement provided, use it; otherwise process all planned measurements
  IF p_measurement_id IS NOT NULL THEN
    -- Insert from measurement_services for specific measurement
    INSERT INTO supply_requests (
      project_id,
      measurement_id,
      item_id,
      item_name,
      item_unit,
      quantity,
      unit_value,
      total_value,
      status,
      source_plan_id,
      family_id,
      scope_id,
      macro_id,
      required_date,
      order_by_date,
      is_critical
    )
    SELECT
      p_project_id,
      ms.measurement_id,
      si.id,
      si.name,
      si.unit,
      si.quantity * ms.planned_houses,
      si.unit_value,
      si.unit_value * si.quantity * ms.planned_houses,
      'alert'::supply_request_status,
      ms.id,
      i.material_family_id,
      ms.scope_id,
      ms.macro_id,
      m.start_date,
      m.start_date - COALESCE(mf.lead_time_days, 7),
      m.start_date - COALESCE(mf.lead_time_days, 7) <= CURRENT_DATE
    FROM measurement_services ms
    JOIN measurements m ON ms.measurement_id = m.id
    JOIN scope_items si ON si.scope_id = ms.scope_id AND si.macro_id = ms.macro_id AND si.category = 'material'
    LEFT JOIN inputs i ON i.name = si.name AND i.project_id = p_project_id
    LEFT JOIN material_families mf ON i.material_family_id = mf.id
    WHERE ms.measurement_id = p_measurement_id
      AND ms.project_id = p_project_id
      AND NOT EXISTS (
        SELECT 1 FROM supply_requests sr 
        WHERE sr.source_plan_id = ms.id 
        AND sr.item_name = si.name
        AND sr.status != 'cancelled'
      );
    
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  ELSE
    -- Process all planned measurements
    INSERT INTO supply_requests (
      project_id,
      measurement_id,
      item_id,
      item_name,
      item_unit,
      quantity,
      unit_value,
      total_value,
      status,
      source_plan_id,
      family_id,
      scope_id,
      macro_id,
      required_date,
      order_by_date,
      is_critical
    )
    SELECT
      p_project_id,
      ms.measurement_id,
      si.id,
      si.name,
      si.unit,
      si.quantity * ms.planned_houses,
      si.unit_value,
      si.unit_value * si.quantity * ms.planned_houses,
      'alert'::supply_request_status,
      ms.id,
      i.material_family_id,
      ms.scope_id,
      ms.macro_id,
      m.start_date,
      m.start_date - COALESCE(mf.lead_time_days, 7),
      m.start_date - COALESCE(mf.lead_time_days, 7) <= CURRENT_DATE
    FROM measurement_services ms
    JOIN measurements m ON ms.measurement_id = m.id
    JOIN scope_items si ON si.scope_id = ms.scope_id AND si.macro_id = ms.macro_id AND si.category = 'material'
    LEFT JOIN inputs i ON i.name = si.name AND i.project_id = p_project_id
    LEFT JOIN material_families mf ON i.material_family_id = mf.id
    WHERE m.status IN ('planned', 'in_progress')
      AND ms.project_id = p_project_id
      AND NOT EXISTS (
        SELECT 1 FROM supply_requests sr 
        WHERE sr.source_plan_id = ms.id 
        AND sr.item_name = si.name
        AND sr.status != 'cancelled'
      );
    
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'inserted_count', v_inserted_count,
    'message', format('%s requisições criadas', v_inserted_count)
  );
END;
$$;