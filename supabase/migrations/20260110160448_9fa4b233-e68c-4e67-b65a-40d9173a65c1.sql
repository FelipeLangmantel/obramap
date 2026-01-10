-- ============================================================
-- FASE 13.6 — ATUALIZAR REALIZADO NO PLANEJAMENTO DO PERÍODO
-- ============================================================

CREATE OR REPLACE FUNCTION public.recalculate_service_planning_period_realized(
  p_service_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service RECORD;
  v_period_id uuid;
  v_real_houses integer;
  v_real_cost numeric;
  v_real_revenue numeric;
BEGIN
  -- Buscar serviço + período
  SELECT
    ms.id,
    m.project_id,
    m.planning_period_id,
    ms.macro_id,
    ms.scope_id
  INTO v_service
  FROM measurement_services ms
  JOIN measurements m ON m.id = ms.measurement_id
  WHERE ms.id = p_service_id;

  IF NOT FOUND OR v_service.planning_period_id IS NULL THEN
    RETURN;
  END IF;

  v_period_id := v_service.planning_period_id;

  -- Casas e custo realizados no período
  SELECT
    COALESCE(SUM(pl.quantity_executed),0),
    COALESCE(SUM(pl.cost_realized),0)
  INTO v_real_houses, v_real_cost
  FROM production_logs pl
  JOIN measurements m ON m.id = pl.measurement_id
  WHERE pl.service_id = p_service_id
    AND m.planning_period_id = v_period_id
    AND pl.is_initial_database = false;

  -- Receita realizada = casas x valor unitário contratual
  SELECT
    COALESCE(v_real_houses * sp.unit_revenue_value,0)
  INTO v_real_revenue
  FROM service_planning_by_period sp
  WHERE sp.planning_period_id = v_period_id
    AND sp.macro_id = v_service.macro_id
    AND sp.scope_id = v_service.scope_id;

  -- Atualizar planejamento do período
  UPDATE service_planning_by_period
  SET
    realized_houses = v_real_houses,
    realized_cost = v_real_cost,
    realized_revenue = COALESCE(v_real_revenue, 0),
    real_result = COALESCE(v_real_revenue, 0) - v_real_cost,
    performance_percent = CASE
      WHEN planned_revenue > 0 THEN
        (COALESCE(v_real_revenue, 0) / planned_revenue) * 100
      ELSE 0
    END,
    status = CASE
      WHEN COALESCE(v_real_revenue, 0) >= planned_revenue THEN 'ok'
      WHEN COALESCE(v_real_revenue, 0) >= planned_revenue * 0.9 THEN 'attention'
      ELSE 'critical'
    END,
    updated_at = now()
  WHERE planning_period_id = v_period_id
    AND macro_id = v_service.macro_id
    AND scope_id = v_service.scope_id;
END;
$$;

-- ============================================================
-- TRIGGER: AO LANÇAR PRODUÇÃO, ATUALIZA O PERÍODO
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_update_planning_period_from_production()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_service_id := OLD.service_id;
  ELSE
    v_service_id := NEW.service_id;
  END IF;

  IF v_service_id IS NOT NULL THEN
    PERFORM recalculate_service_planning_period_realized(v_service_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_update_period_from_production ON public.production_logs;
CREATE TRIGGER trg_update_period_from_production
AFTER INSERT OR UPDATE OR DELETE
ON public.production_logs
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_planning_period_from_production();