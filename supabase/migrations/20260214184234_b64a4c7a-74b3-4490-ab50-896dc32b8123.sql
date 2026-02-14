
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
  -- Verificar se existem serviços cadastrados no projeto
  SELECT count(*) INTO v_service_count
  FROM project_contract_services
  WHERE project_id = p_project_id
    AND macro_id IS NOT NULL
    AND scope_id IS NOT NULL;

  IF v_service_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_services_found');
  END IF;

  -- Buscar contrato (opcional - pode ser NULL)
  SELECT id INTO v_contract_id
  FROM project_contracts
  WHERE project_id = p_project_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Criar versão de planejamento
  INSERT INTO planning_versions (
    company_id, project_id, name, is_active, version_number
  )
  VALUES (
    p_company_id, p_project_id, 'Versão Inicial', true, 1
  )
  RETURNING id INTO v_version_id;

  -- Criar períodos e gerar serviços
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

    -- Gerar serviços a partir de project_contract_services
    -- contract_id será preenchido se existir, NULL se não
    INSERT INTO service_planning_by_period (
      company_id, project_id, contract_id, planning_period_id,
      macro_id, scope_id, macro_name, scope_name,
      unit_cost_value, unit_revenue_value, target_houses,
      planned_cost, planned_revenue, projected_result, status
    )
    SELECT DISTINCT ON (pcs.macro_id, pcs.scope_id)
      p_company_id,
      p_project_id,
      v_contract_id,
      v_period_id,
      pcs.macro_id,
      pcs.scope_id,
      pcs.macro_name,
      pcs.scope_name,
      COALESCE(pcs.max_cost_value, 0),
      COALESCE(pcs.unit_revenue_value, 0),
      0,
      0,
      0,
      0,
      'draft'
    FROM project_contract_services pcs
    WHERE pcs.project_id = p_project_id
      AND pcs.macro_id IS NOT NULL
      AND pcs.scope_id IS NOT NULL
    ORDER BY pcs.macro_id, pcs.scope_id, pcs.created_at DESC
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'planning_version_id', v_version_id
  );
END;
$function$;
