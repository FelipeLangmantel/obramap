
-- ============================================================
-- Update sync_contract_services to also REMOVE stale services
-- that no longer exist in the project's macros_template
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
  v_inserted integer := 0;
  v_deleted integer := 0;
  v_from_source text := 'none';
  v_project_macros jsonb;
  v_valid_scope_ids text[];
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

  -- Get valid scope_ids from macros_template
  SELECT macros_template INTO v_project_macros
  FROM projects WHERE id = p_project_id;

  IF v_project_macros IS NOT NULL AND jsonb_array_length(v_project_macros) > 0 THEN
    SELECT array_agg(scope->>'id')
    INTO v_valid_scope_ids
    FROM jsonb_array_elements(v_project_macros) AS macro,
         jsonb_array_elements(macro->'scopes') AS scope;
  END IF;

  -- ✅ STEP 0: Remove stale services that no longer exist in the project structure
  IF v_valid_scope_ids IS NOT NULL AND array_length(v_valid_scope_ids, 1) > 0 THEN
    DELETE FROM project_contract_services
    WHERE contract_id = v_contract_id
      AND scope_id != ALL(v_valid_scope_ids);

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  -- 1. Insert from measurement_services
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

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted > 0 THEN
    v_from_source := 'measurement_services';
  END IF;

  -- 2. Insert from scope_costs
  IF v_inserted = 0 THEN
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

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted > 0 THEN
      v_from_source := 'scope_costs';
    END IF;
  END IF;

  -- 3. Insert from macros_template
  IF v_inserted = 0 AND v_project_macros IS NOT NULL AND jsonb_array_length(v_project_macros) > 0 THEN
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

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted > 0 THEN
      v_from_source := 'macros_template';
    END IF;
  END IF;

  -- ✅ Also update names from macros_template to ensure consistency
  IF v_project_macros IS NOT NULL AND jsonb_array_length(v_project_macros) > 0 THEN
    UPDATE project_contract_services cs
    SET macro_name = macro->>'name', scope_name = scope->>'name'
    FROM jsonb_array_elements(v_project_macros) AS macro,
         jsonb_array_elements(macro->'scopes') AS scope
    WHERE cs.contract_id = v_contract_id
      AND cs.macro_id = macro->>'id'
      AND cs.scope_id = scope->>'id'
      AND (cs.macro_name IS DISTINCT FROM macro->>'name' OR cs.scope_name IS DISTINCT FROM scope->>'name');
  END IF;

  RETURN jsonb_build_object('success', true, 'inserted', v_inserted, 'deleted', v_deleted, 'source', v_from_source);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_contract_services(uuid, uuid) TO authenticated;
