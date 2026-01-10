-- ============================================================
-- FASE 16.2b — ADICIONAR COLUNAS E TRIGGER DE CAPACIDADE
-- ============================================================

-- Adicionar colunas de produtividade e equipes
ALTER TABLE public.service_planning_by_period
ADD COLUMN IF NOT EXISTS productivity_planned numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS teams_planned integer DEFAULT 1;

-- Trigger para recálculo automático
CREATE OR REPLACE FUNCTION public.trigger_recalc_service_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM recalculate_service_capacity(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_capacity_service ON public.service_planning_by_period;

CREATE TRIGGER trg_recalc_capacity_service
AFTER UPDATE OF target_houses, productivity_planned, teams_planned
ON public.service_planning_by_period
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalc_service_capacity();