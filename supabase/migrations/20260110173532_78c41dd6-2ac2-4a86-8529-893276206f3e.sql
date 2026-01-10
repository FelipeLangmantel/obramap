-- ============================================================
-- FASE 15.1 — INICIALIZAR PLANEJAMENTO DE LONGO PRAZO DA OBRA
-- Cria versão, períodos e linhas de serviços automaticamente
-- ============================================================

CREATE OR REPLACE FUNCTION public.initialize_long_term_planning(
  p_project_id uuid,
  p_company_id uuid,
  p_number_of_periods integer DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version_id uuid;
  v_contract_id uuid;
  v_period_id uuid;
  v_i integer;
BEGIN
  -- Buscar contrato do projeto
  SELECT id INTO v_contract_id
  FROM project_contracts
  WHERE project_id = p_project_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_contract_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'contract_not_found');
  END IF;

  -- Criar versão de planejamento
  INSERT INTO planning_versions (
    company_id,
    project_id,
    name,
    is_active,
    version_number
  )
  VALUES (
    p_company_id,
    p_project_id,
    'Versão Inicial',
    true,
    1
  )
  RETURNING id INTO v_version_id;

  -- Criar períodos (medições)
  FOR v_i IN 1..p_number_of_periods LOOP
    INSERT INTO planning_periods (
      company_id,
      project_id,
      planning_version_id,
      period_number,
      start_date,
      end_date,
      status
    )
    VALUES (
      p_company_id,
      p_project_id,
      v_version_id,
      v_i,
      CURRENT_DATE + ((v_i - 1) * 30),
      CURRENT_DATE + (v_i * 30) - 1,
      'open'
    )
    RETURNING id INTO v_period_id;

    -- Gerar linhas de serviços para o período baseado nos macros do projeto
    INSERT INTO service_planning_by_period (
      company_id,
      project_id,
      contract_id,
      planning_period_id,
      macro_id,
      scope_id,
      macro_name,
      scope_name,
      unit_cost_value,
      unit_revenue_value,
      target_houses,
      planned_cost,
      planned_revenue,
      projected_result,
      status
    )
    SELECT DISTINCT
      p_company_id,
      p_project_id,
      v_contract_id,
      v_period_id,
      ms.macro_id,
      ms.scope_id,
      ms.macro_name,
      ms.scope_name,
      COALESCE(ms.planned_cost / NULLIF(ms.planned_houses, 0), 0),
      0,
      0,
      0,
      0,
      0,
      'planned'
    FROM measurement_services ms
    WHERE ms.project_id = p_project_id
      AND ms.macro_id IS NOT NULL
      AND ms.scope_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'planning_version_id', v_version_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.initialize_long_term_planning(uuid, uuid, integer) TO authenticated;