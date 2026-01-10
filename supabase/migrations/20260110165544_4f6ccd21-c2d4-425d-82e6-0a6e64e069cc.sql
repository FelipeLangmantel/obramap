-- ============================================================
-- FASE 16.3b — FUNÇÃO RECÁLCULO DE RISCO DE CAPACIDADE NO PERÍODO
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalculate_period_capacity_risk(
  p_planning_period_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_services integer;
  v_houses integer;
BEGIN
  SELECT
    COUNT(id),
    COALESCE(SUM(target_houses),0)
  INTO
    v_services,
    v_houses
  FROM service_planning_by_period
  WHERE planning_period_id = p_planning_period_id
    AND capacity_status = 'critical';

  UPDATE planning_periods
  SET
    services_capacity_risk = v_services,
    houses_capacity_risk = v_houses,
    updated_at = now()
  WHERE id = p_planning_period_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_period_capacity_risk(uuid) TO authenticated;