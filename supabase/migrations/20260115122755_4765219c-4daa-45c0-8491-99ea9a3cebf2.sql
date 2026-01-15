-- Atualizar a função generate_period_supply_requirements para fazer upsert e lidar com tipos
DROP FUNCTION IF EXISTS public.generate_period_supply_requirements(uuid);

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
  v_updated integer := 0;
BEGIN
  -- Buscar período
  SELECT * INTO v_period
  FROM planning_periods
  WHERE id = p_planning_period_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'period_not_found');
  END IF;

  -- Upsert: inserir novos ou atualizar quantidade se já existe
  WITH new_requirements AS (
    SELECT
      sp.company_id,
      sp.project_id,
      sp.planning_period_id,
      sp.id AS service_plan_id,
      sp.macro_id::uuid AS macro_id,
      sp.scope_id::uuid AS scope_id,
      bi.input_id,
      COALESCE(bi.input_name, i.name) AS input_name,
      COALESCE(bi.unit, i.unit) AS unit,
      (bi.quantity_per_unit * sp.target_houses) AS quantity_required
    FROM service_planning_by_period sp
    JOIN budget_service_inputs bi
      ON bi.macro_id::text = sp.macro_id
     AND bi.scope_id::text = sp.scope_id
     AND bi.project_id = sp.project_id
    JOIN inputs i ON i.id = bi.input_id
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
    nr.macro_id,
    nr.scope_id,
    nr.input_id,
    nr.input_name,
    nr.unit,
    nr.quantity_required,
    'pending'
  FROM new_requirements nr
  ON CONFLICT (service_plan_id, input_id) 
  DO UPDATE SET
    quantity_required = EXCLUDED.quantity_required,
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

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'items_generated', v_count,
    'items_removed', v_updated
  );
END;
$$;

-- Criar índice único para upsert funcionar (se não existir)
CREATE UNIQUE INDEX IF NOT EXISTS idx_psr_service_input 
ON period_supply_requirements(service_plan_id, input_id);

-- Criar função para gerar requisitos a partir de service_planning_targets (medição)
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
BEGIN
  -- Buscar medição
  SELECT * INTO v_measurement
  FROM measurements
  WHERE id = p_measurement_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'measurement_not_found');
  END IF;

  -- Verificar se medição está vinculada a um período
  IF v_measurement.planning_period_id IS NULL THEN
    -- Criar requisitos diretamente a partir dos targets para supply_requests
    WITH target_inputs AS (
      SELECT DISTINCT
        spt.project_id,
        bi.input_id AS item_id,
        COALESCE(bi.input_name, i.name) AS item_name,
        COALESCE(bi.unit, i.unit, 'un') AS item_unit,
        (bi.quantity_per_unit * spt.planned_houses) AS quantity,
        i.unit_value,
        p_measurement_id AS measurement_id,
        i.material_family_id AS family_id,
        spt.scope_id,
        spt.macro_id,
        v_measurement.start_date AS required_date,
        (v_measurement.start_date - COALESCE(mf.lead_time_days, 7))::date AS order_by_date,
        spt.id AS source_plan_id
      FROM service_planning_targets spt
      JOIN budget_service_inputs bi
        ON bi.macro_id = spt.macro_id
       AND bi.scope_id = spt.scope_id
       AND bi.project_id = spt.project_id
      JOIN inputs i ON i.id = bi.input_id
      LEFT JOIN material_families mf ON mf.id = i.material_family_id
      WHERE spt.measurement_id = p_measurement_id
        AND spt.planned_houses > 0
    )
    INSERT INTO supply_requests (
      project_id, item_id, item_name, item_unit, quantity, unit_value,
      measurement_id, family_id, scope_id, macro_id,
      required_date, order_by_date, source_plan_id, status
    )
    SELECT 
      ti.project_id, ti.item_id, ti.item_name, ti.item_unit, ti.quantity,
      COALESCE(ti.unit_value, 0), ti.measurement_id, ti.family_id,
      ti.scope_id, ti.macro_id, ti.required_date, ti.order_by_date,
      ti.source_plan_id, 'alert'::supply_request_status
    FROM target_inputs ti
    WHERE NOT EXISTS (
      SELECT 1 FROM supply_requests sr
      WHERE sr.project_id = ti.project_id
        AND sr.item_id = ti.item_id
        AND sr.source_plan_id = ti.source_plan_id
        AND sr.status NOT IN ('cancelled', 'delivered')
    )
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    
    RETURN jsonb_build_object(
      'success', true,
      'items_generated', v_count,
      'source', 'service_planning_targets'
    );
  ELSE
    -- Se medição está vinculada a período, usar a função de período
    RETURN generate_period_supply_requirements(v_measurement.planning_period_id);
  END IF;
END;
$$;

-- Função auxiliar para gerar requisitos de todos os períodos de um projeto
CREATE OR REPLACE FUNCTION public.generate_all_supply_requirements_for_project(
  p_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period RECORD;
  v_total_generated integer := 0;
  v_result jsonb;
BEGIN
  -- Iterar por todos os períodos do projeto
  FOR v_period IN 
    SELECT id FROM planning_periods 
    WHERE project_id = p_project_id 
    ORDER BY period_number
  LOOP
    v_result := generate_period_supply_requirements(v_period.id);
    IF (v_result->>'success')::boolean THEN
      v_total_generated := v_total_generated + COALESCE((v_result->>'items_generated')::integer, 0);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'total_items_generated', v_total_generated
  );
END;
$$;