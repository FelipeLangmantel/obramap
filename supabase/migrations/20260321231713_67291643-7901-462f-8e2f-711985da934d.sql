
DO $$
DECLARE
  v_project_id UUID;
  v_company_id UUID;
  v_contract_id UUID;
  v_count INTEGER;
BEGIN
  SELECT p.id, p.company_id INTO v_project_id, v_company_id
  FROM public.projects p
  WHERE p.name ILIKE '%tapejara%'
  LIMIT 1;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Projeto Tapejara não encontrado';
  END IF;

  SELECT id INTO v_contract_id
  FROM public.project_contracts
  WHERE project_id = v_project_id
  ORDER BY created_at DESC LIMIT 1;

  RAISE NOTICE 'Projeto: % | Empresa: % | Contrato: %',
    v_project_id, v_company_id, v_contract_id;

  DELETE FROM public.project_contract_services
  WHERE project_id = v_project_id
    AND scope_name ILIKE '%massa niveladora%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'project_contract_services removidos: %', v_count;

  DELETE FROM public.service_planning_by_period
  WHERE project_id = v_project_id
    AND scope_name ILIKE '%massa niveladora%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'service_planning_by_period removidos: %', v_count;

  DELETE FROM public.weekly_plan_services
  WHERE project_id = v_project_id
    AND scope_name ILIKE '%massa niveladora%';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'weekly_plan_services removidos: %', v_count;

  INSERT INTO public.scope_costs (
    project_id, scope_id, scope_name, macro_id, macro_name, macro_color,
    material_cost, labor_cost, equipment_cost
  )
  SELECT DISTINCT
    v_project_id,
    scope->>'id',
    scope->>'name',
    macro->>'id',
    macro->>'name',
    COALESCE(macro->>'color', '#9ca3af'),
    0, 0, 0
  FROM
    jsonb_array_elements(
      (SELECT macros_template FROM public.projects WHERE id = v_project_id)
    ) AS macro,
    jsonb_array_elements(macro->'scopes') AS scope
  WHERE NOT EXISTS (
    SELECT 1 FROM public.scope_costs sc
    WHERE sc.project_id = v_project_id
      AND sc.scope_id = scope->>'id'
  )
  ON CONFLICT (project_id, scope_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Novos serviços inseridos em scope_costs: %', v_count;

  IF v_contract_id IS NOT NULL THEN
    INSERT INTO public.project_contract_services (
      company_id, project_id, contract_id,
      macro_id, scope_id, macro_name, scope_name,
      unit_revenue_value, max_cost_value, status
    )
    SELECT DISTINCT
      v_company_id, v_project_id, v_contract_id,
      sc.macro_id, sc.scope_id, sc.macro_name, sc.scope_name,
      0, 0, 'pending'
    FROM public.scope_costs sc
    WHERE sc.project_id = v_project_id
      AND NOT EXISTS (
        SELECT 1 FROM public.project_contract_services pcs
        WHERE pcs.contract_id = v_contract_id
          AND pcs.macro_id = sc.macro_id
          AND pcs.scope_id = sc.scope_id
      );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Serviços inseridos em project_contract_services: %', v_count;
  END IF;

  PERFORM public.sync_period_services_with_strategic(v_project_id);
  RAISE NOTICE 'sync_period_services_with_strategic executado';

  RAISE NOTICE 'Concluído. Verifique o Planejamento Semanal da Tapejara.';
END $$;

CREATE OR REPLACE FUNCTION public.apply_structure_mutation(
  p_project_id uuid,
  p_new_template jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_old_template jsonb;
  v_removed_scope_ids text[];
  v_removed_macro_ids text[];
  v_deleted_counts jsonb := '{}'::jsonb;
  v_count integer;
  v_new_scope_ids text[];
  v_company_id uuid;
BEGIN
  SELECT macros_template INTO v_old_template FROM projects WHERE id = p_project_id;
  SELECT company_id INTO v_company_id FROM projects WHERE id = p_project_id;

  IF v_old_template IS NULL THEN v_old_template := '[]'::jsonb; END IF;

  SELECT COALESCE(array_agg(old_scope_id), '{}') INTO v_removed_scope_ids
  FROM (
    SELECT scope->>'id' AS old_scope_id
    FROM jsonb_array_elements(v_old_template) AS macro,
         jsonb_array_elements(macro->'scopes') AS scope
    EXCEPT
    SELECT scope->>'id'
    FROM jsonb_array_elements(p_new_template) AS macro,
         jsonb_array_elements(macro->'scopes') AS scope
  ) removed;

  SELECT COALESCE(array_agg(old_macro_id), '{}') INTO v_removed_macro_ids
  FROM (
    SELECT macro->>'id' AS old_macro_id
    FROM jsonb_array_elements(v_old_template) AS macro
    EXCEPT
    SELECT macro->>'id'
    FROM jsonb_array_elements(p_new_template) AS macro
  ) removed;

  IF array_length(v_removed_scope_ids, 1) > 0 THEN
    DELETE FROM scope_items WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
    DELETE FROM scope_costs WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
    DELETE FROM weekly_productions WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
    DELETE FROM planned_productions WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
    DELETE FROM production_deviations WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
    DELETE FROM labor_contracts WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
    DELETE FROM project_contract_services WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
    DELETE FROM service_planning_by_period WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
    DELETE FROM weekly_plan_services WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
    DELETE FROM project_service_productivity WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
  END IF;

  IF array_length(v_removed_macro_ids, 1) > 0 THEN
    DELETE FROM weekly_productions WHERE project_id = p_project_id AND macro_id = ANY(v_removed_macro_ids);
    DELETE FROM planned_productions WHERE project_id = p_project_id AND macro_id = ANY(v_removed_macro_ids);
    DELETE FROM production_deviations WHERE project_id = p_project_id AND macro_id = ANY(v_removed_macro_ids);
    DELETE FROM labor_contracts WHERE project_id = p_project_id AND macro_id = ANY(v_removed_macro_ids);
    DELETE FROM project_contract_services WHERE project_id = p_project_id AND macro_id = ANY(v_removed_macro_ids);
    DELETE FROM service_planning_by_period WHERE project_id = p_project_id AND macro_id = ANY(v_removed_macro_ids);
    DELETE FROM weekly_plan_services WHERE project_id = p_project_id AND macro_id = ANY(v_removed_macro_ids);
    DELETE FROM labor_histogram WHERE project_id = p_project_id AND macro_id = ANY(v_removed_macro_ids);
    DELETE FROM project_service_productivity WHERE project_id = p_project_id AND macro_id = ANY(v_removed_macro_ids);
  END IF;

  SELECT array_agg(scope->>'id') INTO v_new_scope_ids
  FROM jsonb_array_elements(p_new_template) AS macro,
       jsonb_array_elements(macro->'scopes') AS scope;

  UPDATE weekly_productions wp
  SET scope_name = scope->>'name'
  FROM jsonb_array_elements(p_new_template) AS macro,
       jsonb_array_elements(macro->'scopes') AS scope
  WHERE wp.project_id = p_project_id
    AND wp.scope_id = scope->>'id'
    AND wp.scope_name IS DISTINCT FROM scope->>'name';

  UPDATE projects SET macros_template = p_new_template, updated_at = now()
  WHERE id = p_project_id;

  RETURN jsonb_build_object(
    'success', true,
    'removed_scopes', v_removed_scope_ids,
    'removed_macros', v_removed_macro_ids,
    'total_scopes_removed', COALESCE(array_length(v_removed_scope_ids, 1), 0),
    'total_macros_removed', COALESCE(array_length(v_removed_macro_ids, 1), 0)
  );
END;
$func$;
