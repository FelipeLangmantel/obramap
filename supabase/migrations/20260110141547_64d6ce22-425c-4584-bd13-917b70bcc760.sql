-- ============================================================
-- PASSO 12.6 — DESVIOS ENTRE PLANEJADO x PRODUZIDO
-- ============================================================

ALTER TABLE public.service_planning_targets
ADD COLUMN IF NOT EXISTS realized_houses integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS realized_cost numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS productivity_real numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS deviation_houses integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS deviation_cost numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS deviation_productivity numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS execution_status text DEFAULT 'ok';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_planning_targets_execution_status_check'
  ) THEN
    ALTER TABLE public.service_planning_targets
    ADD CONSTRAINT service_planning_targets_execution_status_check
    CHECK (execution_status IN ('ok','attention','critical'));
  END IF;
END $$;

-- ============================================================
-- FUNÇÃO: RECALCULAR DESVIOS DO PERÍODO
-- ============================================================

CREATE OR REPLACE FUNCTION public.recalculate_service_execution_deviation(
  p_project_id uuid,
  p_measurement_number integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target RECORD;
  v_real_houses integer;
  v_real_cost numeric;
  v_prod_real numeric;
  v_days integer;
BEGIN
  FOR v_target IN
    SELECT *
    FROM service_planning_targets
    WHERE project_id = p_project_id
      AND measurement_number = p_measurement_number
  LOOP
    -- produção real do período (via measurement_services para pegar macro_id/scope_id)
    SELECT
      COALESCE(SUM(pl.quantity_executed), 0),
      COALESCE(SUM(pl.cost_realized), 0),
      COALESCE(COUNT(DISTINCT pl.execution_date), 0)
    INTO v_real_houses, v_real_cost, v_days
    FROM production_logs pl
    JOIN measurement_services ms ON ms.id = pl.service_id
    WHERE pl.project_id = p_project_id
      AND ms.macro_id = v_target.macro_id::text
      AND ms.scope_id = v_target.scope_id::text
      AND pl.execution_date BETWEEN v_target.period_start AND v_target.period_end
      AND pl.is_initial_database = false;

    IF v_days > 0 THEN
      v_prod_real := v_real_houses::numeric / v_days;
    ELSE
      v_prod_real := 0;
    END IF;

    UPDATE service_planning_targets
    SET
      realized_houses = v_real_houses,
      realized_cost = v_real_cost,
      productivity_real = v_prod_real,
      deviation_houses = v_real_houses - planned_houses,
      deviation_cost = v_real_cost - planned_cost,
      deviation_productivity = v_prod_real - productivity_planned,
      execution_status = CASE
        WHEN v_real_houses < planned_houses * 0.85 THEN 'critical'
        WHEN v_real_houses < planned_houses THEN 'attention'
        ELSE 'ok'
      END,
      updated_at = now()
    WHERE id = v_target.id;
  END LOOP;
END;
$$;

-- ============================================================
-- TRIGGER: RECALCULAR DESVIOS AO LANÇAR PRODUÇÃO
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_recalc_targets_on_production()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_measurement_number integer;
  v_project_id uuid;
BEGIN
  -- Determinar project_id baseado na operação
  IF TG_OP = 'DELETE' THEN
    v_project_id := OLD.project_id;
  ELSE
    v_project_id := NEW.project_id;
  END IF;

  -- Buscar measurement_number via measurement_id
  IF TG_OP = 'DELETE' THEN
    SELECT m.measurement_number INTO v_measurement_number
    FROM measurements m
    WHERE m.id = OLD.measurement_id;
  ELSE
    SELECT m.measurement_number INTO v_measurement_number
    FROM measurements m
    WHERE m.id = NEW.measurement_id;
  END IF;

  -- Recalcular se encontrou measurement_number
  IF v_measurement_number IS NOT NULL THEN
    PERFORM recalculate_service_execution_deviation(
      v_project_id,
      v_measurement_number
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_targets_production ON public.production_logs;

CREATE TRIGGER trg_recalc_targets_production
AFTER INSERT OR UPDATE OR DELETE
ON public.production_logs
FOR EACH ROW
EXECUTE FUNCTION trigger_recalc_targets_on_production();