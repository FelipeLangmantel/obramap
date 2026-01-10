-- ============================================================
-- Atualizar RPC sync_contract_services para buscar também do macros_template
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_contract_services(
  p_project_id uuid,
  p_company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract_id uuid;
  v_count integer := 0;
  v_from_source text := 'none';
  v_project_macros jsonb;
BEGIN
  -- contrato ativo do projeto
  SELECT id INTO v_contract_id
  FROM project_contracts
  WHERE project_id = p_project_id
    AND company_id = p_company_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_contract_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'contract_not_found');
  END IF;

  -- 1. Primeiro, tentar inserir de measurement_services
  INSERT INTO project_contract_services (
    company_id, project_id, contract_id, macro_id, scope_id, macro_name, scope_name, unit_revenue_value, status
  )
  SELECT DISTINCT
    p_company_id, p_project_id, v_contract_id,
    ms.macro_id, ms.scope_id, ms.macro_name, ms.scope_name, 0, 'pending'
  FROM measurement_services ms
  WHERE ms.project_id = p_project_id
    AND ms.company_id = p_company_id
    AND NOT EXISTS (
      SELECT 1 FROM project_contract_services cs
      WHERE cs.contract_id = v_contract_id AND cs.macro_id = ms.macro_id AND cs.scope_id = ms.scope_id
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_from_source := 'measurement_services';
  END IF;

  -- 2. Se não encontrou, buscar de scope_costs
  IF v_count = 0 THEN
    INSERT INTO project_contract_services (
      company_id, project_id, contract_id, macro_id, scope_id, macro_name, scope_name, unit_revenue_value, status
    )
    SELECT DISTINCT
      p_company_id, p_project_id, v_contract_id,
      sc.macro_id, sc.scope_id, sc.macro_name, sc.scope_name, 0, 'pending'
    FROM scope_costs sc
    WHERE sc.project_id = p_project_id
      AND NOT EXISTS (
        SELECT 1 FROM project_contract_services cs
        WHERE cs.contract_id = v_contract_id AND cs.macro_id = sc.macro_id AND cs.scope_id = sc.scope_id
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      v_from_source := 'scope_costs';
    END IF;
  END IF;

  -- 3. Se ainda não encontrou, buscar do macros_template do projeto
  IF v_count = 0 THEN
    SELECT macros_template INTO v_project_macros
    FROM projects WHERE id = p_project_id;

    IF v_project_macros IS NOT NULL AND jsonb_array_length(v_project_macros) > 0 THEN
      INSERT INTO project_contract_services (
        company_id, project_id, contract_id, macro_id, scope_id, macro_name, scope_name, unit_revenue_value, status
      )
      SELECT DISTINCT
        p_company_id, p_project_id, v_contract_id,
        macro->>'id', scope->>'id', macro->>'name', scope->>'name', 0, 'pending'
      FROM jsonb_array_elements(v_project_macros) AS macro,
           jsonb_array_elements(macro->'scopes') AS scope
      WHERE NOT EXISTS (
        SELECT 1 FROM project_contract_services cs
        WHERE cs.contract_id = v_contract_id 
          AND cs.macro_id = macro->>'id' 
          AND cs.scope_id = scope->>'id'
      );

      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count > 0 THEN
        v_from_source := 'macros_template';
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'inserted', v_count, 'source', v_from_source);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_contract_services(uuid, uuid) TO authenticated;