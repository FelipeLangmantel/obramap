-- ============================================================
-- FASE 13.4 — TRIGGER DE CÁLCULO AUTOMÁTICO DO PLANEJAMENTO
-- ============================================================

CREATE OR REPLACE FUNCTION public.calc_spbp_financials()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Receita planejada
  NEW.planned_revenue :=
    COALESCE(NEW.target_houses,0) * COALESCE(NEW.unit_revenue_value,0);

  -- Custo planejado
  NEW.planned_cost :=
    COALESCE(NEW.target_houses,0) * COALESCE(NEW.unit_cost_value,0);

  -- Resultado projetado
  NEW.projected_result :=
    NEW.planned_revenue - NEW.planned_cost;

  -- Performance %
  IF NEW.planned_revenue > 0 THEN
    NEW.performance_percent :=
      (NEW.projected_result / NEW.planned_revenue) * 100;
  ELSE
    NEW.performance_percent := 0;
  END IF;

  -- Status básico
  IF NEW.performance_percent >= 0 THEN
    NEW.status := 'ok';
  ELSE
    NEW.status := 'attention';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calc_spbp_financials ON public.service_planning_by_period;
CREATE TRIGGER trg_calc_spbp_financials
BEFORE INSERT OR UPDATE
ON public.service_planning_by_period
FOR EACH ROW
EXECUTE FUNCTION public.calc_spbp_financials();