-- =============================================
-- FASE 6A: RESULTADO REAL POR SERVIÇO
-- =============================================

-- 1) Adicionar campos em measurement_services
ALTER TABLE public.measurement_services
ADD COLUMN IF NOT EXISTS realized_cost numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS financial_result numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS productivity_real numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS service_status text NOT NULL DEFAULT 'positive';

-- Adicionar constraint CHECK separadamente para evitar conflito
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'measurement_services_service_status_check'
  ) THEN
    ALTER TABLE public.measurement_services
    ADD CONSTRAINT measurement_services_service_status_check 
    CHECK (service_status IN ('positive', 'warning', 'negative'));
  END IF;
END $$;

-- 2) Função para recalcular resultado do serviço
CREATE OR REPLACE FUNCTION public.recalculate_service_real_results(p_service_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_cost numeric;
  v_total_houses integer;
  v_days integer;
  v_productivity numeric;
  v_planned_cost numeric;
BEGIN
  -- Soma custo real
  SELECT COALESCE(SUM(cost_realized), 0)
  INTO v_total_cost
  FROM production_logs
  WHERE service_id = p_service_id
    AND is_initial_database = false;

  -- Casas planejadas e custo planejado
  SELECT planned_houses, planned_cost
  INTO v_total_houses, v_planned_cost
  FROM measurement_services
  WHERE id = p_service_id;

  -- Dias executados
  SELECT COUNT(DISTINCT execution_date)
  INTO v_days
  FROM production_logs
  WHERE service_id = p_service_id
    AND is_initial_database = false;

  IF v_days > 0 THEN
    v_productivity := v_total_houses::numeric / v_days;
  ELSE
    v_productivity := 0;
  END IF;

  UPDATE measurement_services
  SET realized_cost = v_total_cost,
      productivity_real = v_productivity,
      financial_result = COALESCE(planned_cost, 0) - v_total_cost,
      service_status = CASE
        WHEN v_total_cost <= COALESCE(planned_cost, 0) THEN 'positive'
        WHEN v_total_cost <= COALESCE(planned_cost, 0) * 1.05 THEN 'warning'
        ELSE 'negative'
      END,
      updated_at = now()
  WHERE id = p_service_id;
END;
$$;

-- 3) Trigger para atualizar serviço ao lançar produção
CREATE OR REPLACE FUNCTION public.trigger_update_service_results_from_production()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    PERFORM public.recalculate_service_real_results(v_service_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_service_results_from_production ON public.production_logs;

CREATE TRIGGER trigger_update_service_results_from_production
AFTER INSERT OR UPDATE OR DELETE ON public.production_logs
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_service_results_from_production();

-- 4) Atualizar serviços existentes (reprocessamento inicial)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM measurement_services LOOP
    PERFORM public.recalculate_service_real_results(r.id);
  END LOOP;
END $$;