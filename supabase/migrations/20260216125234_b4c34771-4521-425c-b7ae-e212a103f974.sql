CREATE OR REPLACE FUNCTION get_service_execution_bank(
  p_project_id uuid
)
RETURNS TABLE (
  macro_id text,
  scope_id text,
  macro_name text,
  scope_name text,
  total_houses bigint,
  executed_houses bigint,
  available_houses bigint,
  completion_percent numeric,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH project_houses AS (
    SELECT COUNT(*)::bigint as total
    FROM houses h
    WHERE h.project_id = p_project_id
  ),
  all_executed AS (
    SELECT 
      p.macro_id,
      p.scope_id,
      p.macro_name,
      p.scope_name,
      (jsonb_array_elements_text(p.house_ids))::integer as house_number
    FROM productions p
    WHERE p.project_id = p_project_id
      AND p.macro_id IS NOT NULL
      AND p.scope_id IS NOT NULL
      AND p.house_ids IS NOT NULL
      AND jsonb_typeof(p.house_ids) = 'array'
    
    UNION ALL
    
    SELECT 
      wp.macro_id,
      wp.scope_id,
      wp.macro_name,
      wp.scope_name,
      (jsonb_array_elements_text(wp.house_ids))::integer as house_number
    FROM weekly_productions wp
    WHERE wp.project_id = p_project_id
      AND wp.macro_id IS NOT NULL
      AND wp.scope_id IS NOT NULL
      AND wp.house_ids IS NOT NULL
      AND jsonb_typeof(wp.house_ids) = 'array'
  ),
  executed_by_service AS (
    SELECT 
      ae.macro_id,
      ae.scope_id,
      MAX(ae.macro_name) as macro_name,
      MAX(ae.scope_name) as scope_name,
      COUNT(DISTINCT ae.house_number)::bigint as executed
    FROM all_executed ae
    GROUP BY ae.macro_id, ae.scope_id
  )
  SELECT 
    COALESCE(e.macro_id, pcs.macro_id)::text,
    COALESCE(e.scope_id, pcs.scope_id)::text,
    COALESCE(e.macro_name, pcs.macro_name)::text,
    COALESCE(e.scope_name, pcs.scope_name)::text,
    ph.total,
    COALESCE(e.executed, 0)::bigint,
    GREATEST(0, ph.total - COALESCE(e.executed, 0))::bigint,
    CASE WHEN ph.total > 0 
      THEN ROUND((COALESCE(e.executed, 0)::numeric / ph.total * 100), 1)
      ELSE 0
    END,
    CASE
      WHEN ph.total > 0 AND COALESCE(e.executed, 0) >= ph.total THEN 'completed'
      WHEN COALESCE(e.executed, 0) > 0 THEN 'in_progress'
      ELSE 'not_started'
    END
  FROM project_houses ph
  CROSS JOIN (
    SELECT DISTINCT 
      pcs_inner.macro_id, 
      pcs_inner.scope_id, 
      pcs_inner.macro_name, 
      pcs_inner.scope_name
    FROM project_contract_services pcs_inner
    WHERE pcs_inner.project_id = p_project_id
      AND pcs_inner.macro_id IS NOT NULL
      AND pcs_inner.scope_id IS NOT NULL
  ) pcs
  LEFT JOIN executed_by_service e ON 
    e.macro_id = pcs.macro_id AND 
    e.scope_id = pcs.scope_id
  ORDER BY 
    CASE 
      WHEN COALESCE(e.executed, 0) >= ph.total AND ph.total > 0 THEN 3
      WHEN COALESCE(e.executed, 0) > 0 THEN 2
      ELSE 1
    END,
    pcs.macro_name, pcs.scope_name;
END;
$$;