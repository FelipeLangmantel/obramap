
-- 1. Limpar duplicatas existentes antes de adicionar constraint
DELETE FROM service_planning_by_period a
USING service_planning_by_period b
WHERE a.id > b.id
  AND a.planning_period_id = b.planning_period_id
  AND a.macro_id = b.macro_id
  AND a.scope_id = b.scope_id;

-- 2. Adicionar constraint de unicidade
ALTER TABLE service_planning_by_period
DROP CONSTRAINT IF EXISTS unique_service_per_period;

ALTER TABLE service_planning_by_period
ADD CONSTRAINT unique_service_per_period
UNIQUE (planning_period_id, macro_id, scope_id);

-- 3. Recriar função com GROUP BY
CREATE OR REPLACE FUNCTION public.initialize_long_term_planning(
  p_project_id uuid,
  p_company_id uuid,
  p_number_of_periods integer DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_version_id uuid;
  v_contract_id uuid;
  v_period_id uuid;
  v_i integer;
  v_service_count integer;
BEGIN
  SELECT count(DISTINCT (macro_id, scope_id)) INTO v_service_count
  FROM project_contract_services
  WHERE project_id = p_project_id
    AND macro_id IS NOT NULL
    AND scope_id IS NOT NULL;

  IF v_service_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_services_found');
  END IF;

  SELECT id INTO v_contract_id
  FROM project_contracts
  WHERE project_id = p_project_id
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO planning_versions (
    company_id, project_id, name, is_active, version_number
  )
  VALUES (
    p_company_id, p_project_id, 'Versão Inicial', true, 1
  )
  RETURNING id INTO v_version_id;

  FOR v_i IN 1..p_number_of_periods LOOP
    INSERT INTO planning_periods (
      company_id, project_id, planning_version_id,
      period_number, start_date, end_date, status
    )
    VALUES (
      p_company_id, p_project_id, v_version_id, v_i,
      CURRENT_DATE + ((v_i - 1) * 30),
      CURRENT_DATE + (v_i * 30) - 1,
      'draft'
    )
    RETURNING id INTO v_period_id;

    INSERT INTO service_planning_by_period (
      company_id, project_id, contract_id, planning_period_id,
      macro_id, scope_id, macro_name, scope_name,
      unit_cost_value, unit_revenue_value, target_houses,
      planned_cost, planned_revenue, projected_result, status
    )
    SELECT
      p_company_id,
      p_project_id,
      v_contract_id,
      v_period_id,
      pcs.macro_id,
      pcs.scope_id,
      MAX(pcs.macro_name),
      MAX(pcs.scope_name),
      COALESCE(MAX(pcs.max_cost_value), 0),
      COALESCE(MAX(pcs.unit_revenue_value), 0),
      0, 0, 0, 0, 'draft'
    FROM project_contract_services pcs
    WHERE pcs.project_id = p_project_id
      AND pcs.macro_id IS NOT NULL
      AND pcs.scope_id IS NOT NULL
    GROUP BY pcs.macro_id, pcs.scope_id;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'planning_version_id', v_version_id
  );
END;
$function$;
