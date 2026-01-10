-- ============================================================
-- FASE 16.3c — TRIGGER RECÁLCULO RISCO DE CAPACIDADE NO PERÍODO
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_recalc_period_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.capacity_status IS DISTINCT FROM NEW.capacity_status THEN
    PERFORM recalculate_period_capacity_risk(NEW.planning_period_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_period_capacity ON public.service_planning_by_period;

CREATE TRIGGER trg_recalc_period_capacity
AFTER UPDATE OF capacity_status
ON public.service_planning_by_period
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalc_period_capacity();