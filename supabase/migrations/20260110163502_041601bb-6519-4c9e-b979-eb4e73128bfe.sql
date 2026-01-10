-- ============================================================
-- TRIGGER — REPROCESSAR RISCO APÓS GERAR INSUMOS DO PERÍODO
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_recalc_item_supply_risk()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM recalculate_period_item_supply_risk(NEW.planning_period_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_psr_recalc_risk ON public.period_supply_requirements;

CREATE TRIGGER trg_psr_recalc_risk
AFTER INSERT
ON public.period_supply_requirements
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalc_item_supply_risk();