-- ============================================================
-- FASE 15.7b — RECÁLCULO AUTOMÁTICO DE IMPACTO NO PERÍODO
-- ============================================================

-- Função para recalcular impacto de suprimentos no período
CREATE OR REPLACE FUNCTION public.recalculate_period_supply_impact(
  p_planning_period_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_services_at_risk integer;
  v_houses_at_risk integer;
  v_revenue_at_risk numeric;
  v_result_at_risk numeric;
BEGIN
  -- Calcular métricas de risco
  SELECT 
    COUNT(DISTINCT sp.id),
    COALESCE(SUM(sp.target_houses), 0),
    COALESCE(SUM(sp.projected_revenue), 0),
    COALESCE(SUM(sp.projected_profit), 0)
  INTO 
    v_services_at_risk,
    v_houses_at_risk,
    v_revenue_at_risk,
    v_result_at_risk
  FROM service_planning_by_period sp
  WHERE sp.planning_period_id = p_planning_period_id
    AND sp.supply_risk = true;

  -- Atualizar período
  UPDATE planning_periods
  SET 
    services_at_risk = COALESCE(v_services_at_risk, 0),
    houses_at_risk = COALESCE(v_houses_at_risk, 0),
    revenue_at_risk = COALESCE(v_revenue_at_risk, 0),
    result_at_risk = COALESCE(v_result_at_risk, 0),
    updated_at = now()
  WHERE id = p_planning_period_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_period_supply_impact(uuid) TO authenticated;

-- Trigger para recalcular quando supply_risk mudar
CREATE OR REPLACE FUNCTION public.trigger_recalc_period_impact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.supply_risk IS DISTINCT FROM NEW.supply_risk THEN
    PERFORM recalculate_period_supply_impact(NEW.planning_period_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_period_impact ON public.service_planning_by_period;

CREATE TRIGGER trg_recalc_period_impact
AFTER UPDATE OF supply_risk ON public.service_planning_by_period
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalc_period_impact();