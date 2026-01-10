-- ============================================================
-- PASSO 12.5 — GERAR METAS DE SERVIÇOS POR PERÍODO (AUTOMÁTICO)
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_service_planning_targets(
  p_project_id uuid,
  p_measurement_number integer,
  p_period_start date,
  p_period_end date,
  p_scenario_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer;
  v_service RECORD;
  v_targets integer := 0;
  v_planned_houses integer;
  v_duration integer;
  v_planned_cost numeric;
  v_planned_revenue numeric;
  v_unit_cost numeric;
  v_unit_revenue numeric;
  v_contract RECORD;
  v_project RECORD;
BEGIN
  v_days := (p_period_end - p_period_start) + 1;

  -- Buscar projeto
  SELECT * INTO v_project
  FROM projects
  WHERE id = p_project_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'project_not_found');
  END IF;

  -- Buscar contrato do projeto
  SELECT pc.*
  INTO v_contract
  FROM project_contracts pc
  WHERE pc.project_id = p_project_id
  ORDER BY pc.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'contract_not_found');
  END IF;

  -- Limpar metas existentes do período
  DELETE FROM service_planning_targets
  WHERE project_id = p_project_id
    AND measurement_number = p_measurement_number
    AND (
      (p_scenario_id IS NULL AND scenario_id IS NULL)
      OR scenario_id = p_scenario_id
    );

  -- Gerar metas por serviço do orçamento
  FOR v_service IN
    SELECT
      ms.*,
      m.company_id
    FROM measurement_services ms
    JOIN measurements m ON m.id = ms.measurement_id
    WHERE m.project_id = p_project_id
  LOOP
    -- casas possíveis no período
    IF v_service.productivity_expected > 0 AND v_service.teams_expected > 0 THEN
      v_planned_houses :=
        FLOOR(v_service.productivity_expected * v_service.teams_expected * v_days);
    ELSE
      v_planned_houses := 0;
    END IF;

    IF v_planned_houses < 0 THEN v_planned_houses := 0; END IF;

    -- custo unitário do serviço
    IF v_service.planned_houses > 0 THEN
      v_unit_cost := v_service.planned_cost / v_service.planned_houses;
    ELSE
      v_unit_cost := 0;
    END IF;

    -- receita unitária (do contrato dividido pelas casas do projeto)
    IF v_project.total_houses > 0 THEN
      v_unit_revenue := v_contract.contract_value_total / v_project.total_houses;
    ELSE
      v_unit_revenue := 0;
    END IF;

    v_planned_cost := v_unit_cost * v_planned_houses;
    v_planned_revenue := v_unit_revenue * v_planned_houses;

    v_duration := estimate_service_duration_days(
      v_planned_houses,
      v_service.productivity_expected,
      v_service.teams_expected
    );

    INSERT INTO service_planning_targets (
      company_id,
      project_id,
      scenario_id,
      measurement_number,
      period_start,
      period_end,
      macro_id,
      scope_id,
      macro_name,
      scope_name,
      planned_houses,
      teams_planned,
      productivity_planned,
      planned_duration_days,
      planned_cost,
      planned_revenue,
      planned_margin
    )
    VALUES (
      v_service.company_id,
      p_project_id,
      p_scenario_id,
      p_measurement_number,
      p_period_start,
      p_period_end,
      v_service.macro_id::uuid,
      v_service.scope_id::uuid,
      v_service.macro_name,
      v_service.scope_name,
      v_planned_houses,
      v_service.teams_expected,
      v_service.productivity_expected,
      v_duration,
      v_planned_cost,
      v_planned_revenue,
      v_planned_revenue - v_planned_cost
    );

    v_targets := v_targets + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'targets_generated', v_targets,
    'measurement_number', p_measurement_number
  );
END;
$$;