-- ============================================================
-- PASSO 12.3 — CLONAR PLANEJAMENTO REAL PARA CENÁRIO
-- ============================================================

-- Dropar função existente para recriar com novos parâmetros
DROP FUNCTION IF EXISTS public.estimate_service_duration_days(integer, numeric, integer);

-- Função auxiliar para estimar duração
CREATE OR REPLACE FUNCTION public.estimate_service_duration_days(
  p_planned_houses integer,
  p_productivity numeric,
  p_teams integer
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_productivity <= 0 OR p_teams <= 0 THEN
    RETURN 0;
  END IF;
  RETURN CEIL(p_planned_houses::numeric / (p_productivity * p_teams))::integer;
END;
$$;

-- Função principal para clonar serviços
CREATE OR REPLACE FUNCTION public.clone_services_to_scenario(
  p_scenario_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scenario RECORD;
  v_count integer := 0;
BEGIN
  -- Buscar cenário
  SELECT * INTO v_scenario
  FROM planning_scenarios
  WHERE id = p_scenario_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'scenario_not_found');
  END IF;

  -- Limpar serviços existentes do cenário
  DELETE FROM scenario_services
  WHERE scenario_id = p_scenario_id;

  -- Clonar serviços do planejamento real (última medição aberta ou todas)
  INSERT INTO scenario_services (
    scenario_id,
    measurement_service_id,
    macro_id,
    scope_id,
    macro_name,
    scope_name,
    planned_houses,
    productivity_expected,
    teams_expected,
    planned_cost,
    simulated_duration_days
  )
  SELECT
    p_scenario_id,
    ms.id,
    ms.macro_id::uuid,
    ms.scope_id::uuid,
    ms.macro_name,
    ms.scope_name,
    ms.planned_houses,
    ms.productivity_expected,
    ms.teams_expected,
    ms.planned_cost,
    estimate_service_duration_days(
      ms.planned_houses,
      ms.productivity_expected,
      ms.teams_expected
    )
  FROM measurement_services ms
  JOIN measurements m ON m.id = ms.measurement_id
  WHERE m.project_id = v_scenario.project_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'services_cloned', v_count
  );
END;
$$;