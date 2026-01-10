-- ============================================================
-- FASE 16.2 — CALCULAR CAPACIDADE DE PRODUÇÃO POR SERVIÇO
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalculate_service_capacity(
  p_service_planning_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target integer;
  v_productivity numeric;
  v_teams integer;
  v_days integer;
  v_capacity numeric;
BEGIN
  SELECT 
    sp.target_houses,
    sp.productivity_planned,
    sp.teams_planned,
    COALESCE(pp.working_days, 0)
  INTO
    v_target,
    v_productivity,
    v_teams,
    v_days
  FROM service_planning_by_period sp
  JOIN planning_periods pp ON pp.id = sp.planning_period_id
  WHERE sp.id = p_service_planning_id;

  v_capacity := COALESCE(v_productivity,0) * COALESCE(v_teams,0) * COALESCE(v_days,0);

  UPDATE service_planning_by_period
  SET
    available_days = v_days,
    production_capacity = v_capacity,
    capacity_status = CASE
      WHEN v_capacity < v_target * 0.85 THEN 'critical'
      WHEN v_capacity < v_target THEN 'attention'
      ELSE 'ok'
    END,
    updated_at = now()
  WHERE id = p_service_planning_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_service_capacity(uuid) TO authenticated;