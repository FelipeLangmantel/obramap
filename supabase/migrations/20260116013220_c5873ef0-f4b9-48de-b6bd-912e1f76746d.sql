-- ============================================================
-- FIX: RPCs devem usar scope_items ao invés de budget_service_inputs
-- scope_items é a tabela real com dados (490 registros)
-- budget_service_inputs está vazia
-- ============================================================

-- 1. Atualizar generate_period_supply_requirements para usar scope_items
CREATE OR REPLACE FUNCTION public.generate_period_supply_requirements(
  p_planning_period_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period RECORD;
  v_count integer := 0;
  v_removed integer := 0;
BEGIN
  -- Buscar período
  SELECT * INTO v_period
  FROM planning_periods
  WHERE id = p_planning_period_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'period_not_found');
  END IF;

  -- Upsert: inserir novos ou atualizar quantidade se já existe
  -- CORRIGIDO: usa scope_items ao invés de budget_service_inputs
  WITH new_requirements AS (
    SELECT
      sp.company_id,
      sp.project_id,
      sp.planning_period_id,
      sp.id AS service_plan_id,
      sp.macro_id::text AS macro_id_text,
      sp.scope_id::text AS scope_id_text,
      si.id AS scope_item_id,
      si.name AS input_name,
      si.unit,
      si.input_id,
      si.material_family,
      (si.quantity * sp.target_houses) AS quantity_required,
      (si.unit_value * si.quantity * sp.target_houses) AS total_value
    FROM service_planning_by_period sp
    JOIN scope_items si
      ON si.macro_id = sp.macro_id
     AND si.scope_id = sp.scope_id
     AND si.project_id = sp.project_id
    WHERE sp.planning_period_id = p_planning_period_id
      AND sp.target_houses > 0
  )
  INSERT INTO period_supply_requirements (
    company_id,
    project_id,
    planning_period_id,
    service_plan_id,
    macro_id,
    scope_id,
    input_id,
    input_name,
    unit,
    quantity_required,
    status
  )
  SELECT
    nr.company_id,
    nr.project_id,
    nr.planning_period_id,
    nr.service_plan_id,
    -- Tentar converter para UUID, se falhar usar NULL
    CASE WHEN nr.macro_id_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
         THEN nr.macro_id_text::uuid ELSE NULL END,
    CASE WHEN nr.scope_id_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
         THEN nr.scope_id_text::uuid ELSE NULL END,
    COALESCE(nr.input_id, nr.scope_item_id), -- Usar scope_item_id se input_id for NULL
    nr.input_name,
    nr.unit,
    nr.quantity_required,
    'pending'
  FROM new_requirements nr
  ON CONFLICT (service_plan_id, input_id) 
  DO UPDATE SET
    quantity_required = EXCLUDED.quantity_required,
    input_name = EXCLUDED.input_name,
    unit = EXCLUDED.unit,
    updated_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Remover requisitos de serviços que não existem mais ou tem 0 casas
  DELETE FROM period_supply_requirements psr
  WHERE psr.planning_period_id = p_planning_period_id
    AND NOT EXISTS (
      SELECT 1 FROM service_planning_by_period sp
      WHERE sp.id = psr.service_plan_id
        AND sp.target_houses > 0
    );

  GET DIAGNOSTICS v_removed = ROW_COUNT;

  RAISE NOTICE 'generate_period_supply_requirements: period=%, generated=%, removed=%', 
    p_planning_period_id, v_count, v_removed;

  RETURN jsonb_build_object(
    'success', true,
    'items_generated', v_count,
    'items_removed', v_removed,
    'period_id', p_planning_period_id
  );
END;
$$;

-- 2. Atualizar generate_supply_requirements_from_targets para usar scope_items
CREATE OR REPLACE FUNCTION public.generate_supply_requirements_from_targets(
  p_measurement_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_measurement RECORD;
  v_count integer := 0;
  v_removed integer := 0;
BEGIN
  -- Buscar medição
  SELECT * INTO v_measurement
  FROM measurements
  WHERE id = p_measurement_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'measurement_not_found');
  END IF;

  -- Verificar se medição está vinculada a um período
  IF v_measurement.planning_period_id IS NOT NULL THEN
    -- Delegar para a função de período
    RETURN generate_period_supply_requirements(v_measurement.planning_period_id);
  END IF;

  -- Criar requisitos diretamente a partir dos targets para supply_requests
  -- CORRIGIDO: usa scope_items ao invés de budget_service_inputs
  WITH target_inputs AS (
    SELECT DISTINCT
      spt.project_id,
      si.id AS item_id,
      si.name AS item_name,
      COALESCE(si.unit, 'un') AS item_unit,
      (si.quantity * spt.planned_houses) AS quantity,
      si.unit_value,
      p_measurement_id AS measurement_id,
      mf.id AS family_id,
      spt.scope_id,
      spt.macro_id,
      v_measurement.start_date AS required_date,
      -- Usar função de lead time se existir, senão 7 dias padrão
      (v_measurement.start_date - COALESCE(
        (SELECT lead_time_days FROM project_material_lead_times 
         WHERE project_id = spt.project_id AND family_id = mf.id),
        mf.lead_time_days, 
        7
      ))::date AS order_by_date,
      spt.id AS source_plan_id
    FROM service_planning_targets spt
    JOIN scope_items si
      ON si.macro_id = spt.macro_id
     AND si.scope_id = spt.scope_id
     AND si.project_id = spt.project_id
    LEFT JOIN inputs inp ON inp.id = si.input_id
    LEFT JOIN material_families mf ON mf.id = inp.material_family_id
       OR mf.name = si.material_family
    WHERE spt.measurement_id = p_measurement_id
      AND spt.planned_houses > 0
  )
  INSERT INTO supply_requests (
    project_id, item_id, item_name, item_unit, quantity, unit_value,
    measurement_id, family_id, scope_id, macro_id,
    required_date, order_by_date, source_plan_id, status
  )
  SELECT
    ti.project_id, ti.item_id, ti.item_name, ti.item_unit, ti.quantity, ti.unit_value,
    ti.measurement_id, ti.family_id, ti.scope_id, ti.macro_id,
    ti.required_date, ti.order_by_date, ti.source_plan_id::text, 'alert'
  FROM target_inputs ti
  ON CONFLICT (project_id, item_id, measurement_id) 
  DO UPDATE SET
    quantity = EXCLUDED.quantity,
    unit_value = EXCLUDED.unit_value,
    required_date = EXCLUDED.required_date,
    order_by_date = EXCLUDED.order_by_date,
    updated_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Remover requisitos de serviços que não existem mais
  DELETE FROM supply_requests sr
  WHERE sr.measurement_id = p_measurement_id
    AND sr.status = 'alert'
    AND NOT EXISTS (
      SELECT 1 FROM service_planning_targets spt
      JOIN scope_items si ON si.macro_id = spt.macro_id 
                         AND si.scope_id = spt.scope_id 
                         AND si.project_id = spt.project_id
      WHERE spt.measurement_id = p_measurement_id
        AND spt.planned_houses > 0
        AND si.id = sr.item_id
    );

  GET DIAGNOSTICS v_removed = ROW_COUNT;

  RAISE NOTICE 'generate_supply_requirements_from_targets: measurement=%, generated=%, removed=%', 
    p_measurement_id, v_count, v_removed;

  RETURN jsonb_build_object(
    'success', true,
    'items_generated', v_count,
    'items_removed', v_removed,
    'source', 'targets',
    'measurement_id', p_measurement_id
  );
END;
$$;

-- 3. Criar função sync_period_supply_requirements para limpeza e recriação
CREATE OR REPLACE FUNCTION public.sync_period_supply_requirements(
  p_planning_period_id uuid,
  p_measurement_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
  v_result jsonb;
BEGIN
  -- Se measurement_id fornecido, usar generate_supply_requirements_from_targets
  IF p_measurement_id IS NOT NULL THEN
    -- Limpar requisitos antigos do período antes de recriar
    DELETE FROM supply_requests 
    WHERE measurement_id = p_measurement_id 
    AND status = 'alert';
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    
    SELECT generate_supply_requirements_from_targets(p_measurement_id) INTO v_result;
    
    RETURN jsonb_build_object(
      'success', (v_result->>'success')::boolean,
      'items_cleaned', v_deleted,
      'items_generated', (v_result->>'items_generated')::integer,
      'source', 'measurement'
    );
  END IF;

  -- Se apenas period_id, usar generate_period_supply_requirements
  IF p_planning_period_id IS NOT NULL THEN
    -- Limpar requisitos antigos do período antes de recriar
    DELETE FROM period_supply_requirements 
    WHERE planning_period_id = p_planning_period_id;
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    
    SELECT generate_period_supply_requirements(p_planning_period_id) INTO v_result;
    
    RETURN jsonb_build_object(
      'success', (v_result->>'success')::boolean,
      'items_cleaned', v_deleted,
      'items_generated', (v_result->>'items_generated')::integer,
      'source', 'period'
    );
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'no_valid_id_provided');
END;
$$;