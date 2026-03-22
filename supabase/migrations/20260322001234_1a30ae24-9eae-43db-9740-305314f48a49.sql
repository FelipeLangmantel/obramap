
CREATE OR REPLACE FUNCTION public.apply_structure_mutation(
  p_project_id uuid,
  p_new_template jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_template jsonb;
  v_removed_scope_ids text[];
  v_removed_macro_ids text[];
  v_deleted_counts jsonb := '{}'::jsonb;
  v_count integer;
  v_new_scope_ids text[];
  v_company_id uuid;
BEGIN
  SELECT macros_template INTO v_old_template
  FROM projects WHERE id = p_project_id;

  SELECT company_id INTO v_company_id
  FROM projects WHERE id = p_project_id;

  IF v_old_template IS NULL THEN
    v_old_template := '[]'::jsonb;
  END IF;

  SELECT COALESCE(array_agg(old_scope_id), '{}')
  INTO v_removed_scope_ids
  FROM (
    SELECT scope->>'id' AS old_scope_id
    FROM jsonb_array_elements(v_old_template) AS macro,
         jsonb_array_elements(macro->'scopes') AS scope
    EXCEPT
    SELECT scope->>'id'
    FROM jsonb_array_elements(p_new_template) AS macro,
         jsonb_array_elements(macro->'scopes') AS scope
  ) removed;

  SELECT COALESCE(array_agg(old_macro_id), '{}')
  INTO v_removed_macro_ids
  FROM (
    SELECT macro->>'id' AS old_macro_id
    FROM jsonb_array_elements(v_old_template) AS macro
    EXCEPT
    SELECT macro->>'id'
    FROM jsonb_array_elements(p_new_template) AS macro
  ) removed;

  -- CASCADE DELETIONS for removed scopes
  IF array_length(v_removed_scope_ids, 1) > 0 THEN
    DELETE FROM scope_items WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
    DELETE FROM scope_costs WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
    DELETE FROM budget_service_inputs WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
    DELETE FROM weekly_productions WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
    DELETE FROM planned_productions WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
    DELETE FROM production_deviations WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
    DELETE FROM labor_contracts WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
    DELETE FROM project_contract_services WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
    DELETE FROM service_planning_by_period WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
    DELETE FROM weekly_plan_services WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
    DELETE FROM measurement_services WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
    DELETE FROM project_service_productivity WHERE project_id = p_project_id AND scope_id = ANY(v_removed_scope_ids);
  END IF;

  -- CASCADE DELETIONS for removed macros
  IF array_length(v_removed_macro_ids, 1) > 0 THEN
    DELETE FROM weekly_productions WHERE project_id = p_project_id AND macro_id = ANY(v_removed_macro_ids);
    DELETE FROM planned_productions WHERE project_id = p_project_id AND macro_id = ANY(v_removed_macro_ids);
    DELETE FROM production_deviations WHERE project_id = p_project_id AND macro_id = ANY(v_removed_macro_ids);
    DELETE FROM labor_contracts WHERE project_id = p_project_id AND macro_id = ANY(v_removed_macro_ids);
    DELETE FROM project_contract_services WHERE project_id = p_project_id AND macro_id = ANY(v_removed_macro_ids);
    DELETE FROM service_planning_by_period WHERE project_id = p_project_id AND macro_id = ANY(v_removed_macro_ids);
    DELETE FROM weekly_plan_services WHERE project_id = p_project_id AND macro_id = ANY(v_removed_macro_ids);
    DELETE FROM measurement_services WHERE project_id = p_project_id AND macro_id = ANY(v_removed_macro_ids);
    DELETE FROM labor_histogram WHERE project_id = p_project_id AND macro_id = ANY(v_removed_macro_ids);
    DELETE FROM project_service_productivity WHERE project_id = p_project_id AND macro_id = ANY(v_removed_macro_ids);
  END IF;

  -- PROPAGATE NAME/COLOR/ORDER for surviving scopes
  UPDATE weekly_productions wp
  SET scope_name = scope->>'name'
  FROM jsonb_array_elements(p_new_template) AS macro,
       jsonb_array_elements(macro->'scopes') AS scope
  WHERE wp.project_id = p_project_id
    AND wp.scope_id = scope->>'id'
    AND wp.scope_name IS DISTINCT FROM scope->>'name';

  UPDATE planned_productions pp
  SET scope_name = scope->>'name'
  FROM jsonb_array_elements(p_new_template) AS macro,
       jsonb_array_elements(macro->'scopes') AS scope
  WHERE pp.project_id = p_project_id
    AND pp.scope_id = scope->>'id'
    AND pp.scope_name IS DISTINCT FROM scope->>'name';

  UPDATE production_deviations pd
  SET scope_name = scope->>'name'
  FROM jsonb_array_elements(p_new_template) AS macro,
       jsonb_array_elements(macro->'scopes') AS scope
  WHERE pd.project_id = p_project_id
    AND pd.scope_id = scope->>'id'
    AND pd.scope_name IS DISTINCT FROM scope->>'name';

  UPDATE project_contract_services cs
  SET scope_name = scope->>'name',
      macro_name = macro->>'name',
      macro_order = macro_idx.ord - 1,
      scope_order = scope_idx.ord - 1
  FROM (SELECT m.value AS macro, row_number() OVER () AS ord FROM jsonb_array_elements(p_new_template) AS m(value)) macro_idx,
       LATERAL (SELECT s.value AS scope, row_number() OVER () AS ord FROM jsonb_array_elements(macro_idx.macro->'scopes') AS s(value)) scope_idx
  WHERE cs.project_id = p_project_id
    AND cs.scope_id = scope_idx.scope->>'id';

  UPDATE service_planning_by_period sp
  SET scope_name = scope->>'name',
      macro_name = macro->>'name',
      macro_order = macro_idx.ord - 1,
      scope_order = scope_idx.ord - 1
  FROM (SELECT m.value AS macro, row_number() OVER () AS ord FROM jsonb_array_elements(p_new_template) AS m(value)) macro_idx,
       LATERAL (SELECT s.value AS scope, row_number() OVER () AS ord FROM jsonb_array_elements(macro_idx.macro->'scopes') AS s(value)) scope_idx
  WHERE sp.project_id = p_project_id
    AND sp.scope_id = scope_idx.scope->>'id';

  UPDATE measurement_services ms
  SET scope_name = scope->>'name', macro_name = macro->>'name',
      macro_color = COALESCE(macro->>'color', ms.macro_color)
  FROM jsonb_array_elements(p_new_template) AS macro,
       jsonb_array_elements(macro->'scopes') AS scope
  WHERE ms.project_id = p_project_id
    AND ms.scope_id = scope->>'id'
    AND (ms.scope_name IS DISTINCT FROM scope->>'name' OR ms.macro_name IS DISTINCT FROM macro->>'name');

  UPDATE labor_contracts lc
  SET scope_name = scope->>'name', macro_name = macro->>'name'
  FROM jsonb_array_elements(p_new_template) AS macro,
       jsonb_array_elements(macro->'scopes') AS scope
  WHERE lc.project_id = p_project_id
    AND lc.scope_id = scope->>'id'
    AND (lc.scope_name IS DISTINCT FROM scope->>'name' OR lc.macro_name IS DISTINCT FROM macro->>'name');

  -- PROPAGATE MACRO-LEVEL name/color
  UPDATE weekly_productions wp
  SET macro_name = macro->>'name',
      macro_color = COALESCE(macro->>'color', wp.macro_color)
  FROM jsonb_array_elements(p_new_template) AS macro
  WHERE wp.project_id = p_project_id
    AND wp.macro_id = macro->>'id'
    AND (wp.macro_name IS DISTINCT FROM macro->>'name' OR wp.macro_color IS DISTINCT FROM macro->>'color');

  UPDATE planned_productions pp
  SET macro_name = macro->>'name',
      macro_color = COALESCE(macro->>'color', pp.macro_color)
  FROM jsonb_array_elements(p_new_template) AS macro
  WHERE pp.project_id = p_project_id
    AND pp.macro_id = macro->>'id'
    AND (pp.macro_name IS DISTINCT FROM macro->>'name' OR pp.macro_color IS DISTINCT FROM macro->>'color');

  UPDATE labor_histogram lh
  SET macro_name = macro->>'name'
  FROM jsonb_array_elements(p_new_template) AS macro
  WHERE lh.project_id = p_project_id
    AND lh.macro_id = macro->>'id'
    AND lh.macro_name IS DISTINCT FROM macro->>'name';

  -- Apply template
  UPDATE projects
  SET macros_template = p_new_template
  WHERE id = p_project_id;

  -- Sync contract services
  PERFORM sync_contract_services(p_project_id, v_company_id);

  -- Update order on newly created contract services
  UPDATE project_contract_services cs
  SET macro_order = macro_idx.ord - 1,
      scope_order = scope_idx.ord - 1
  FROM (SELECT m.value AS macro, row_number() OVER () AS ord FROM jsonb_array_elements(p_new_template) AS m(value)) macro_idx,
       LATERAL (SELECT s.value AS scope, row_number() OVER () AS ord FROM jsonb_array_elements(macro_idx.macro->'scopes') AS s(value)) scope_idx
  WHERE cs.project_id = p_project_id
    AND cs.scope_id = scope_idx.scope->>'id';

  RETURN jsonb_build_object(
    'success', true,
    'removed_scopes', to_jsonb(v_removed_scope_ids),
    'removed_macros', to_jsonb(v_removed_macro_ids),
    'total_scopes_removed', COALESCE(array_length(v_removed_scope_ids, 1), 0),
    'total_macros_removed', COALESCE(array_length(v_removed_macro_ids, 1), 0)
  );
END;
$$;
