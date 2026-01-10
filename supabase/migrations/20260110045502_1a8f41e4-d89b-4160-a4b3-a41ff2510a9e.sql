-- =============================================
-- FASE 5: PRODUÇÃO REAL - production_logs
-- =============================================

-- 1) Criar tabela production_logs
CREATE TABLE public.production_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  measurement_id uuid REFERENCES public.measurements(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.measurement_services(id) ON DELETE SET NULL,

  house_id uuid NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,

  quantity_executed numeric NOT NULL DEFAULT 1,
  cost_realized numeric NOT NULL DEFAULT 0,

  execution_date date NOT NULL DEFAULT CURRENT_DATE,

  is_initial_database boolean NOT NULL DEFAULT false,
  is_unplanned boolean NOT NULL DEFAULT false,

  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices de performance
CREATE INDEX idx_production_logs_company_project ON public.production_logs(company_id, project_id);
CREATE INDEX idx_production_logs_measurement ON public.production_logs(measurement_id);
CREATE INDEX idx_production_logs_service ON public.production_logs(service_id);
CREATE INDEX idx_production_logs_house ON public.production_logs(house_id);
CREATE INDEX idx_production_logs_execution_date ON public.production_logs(execution_date);

-- 2) Bloquear produção em medição fechada
CREATE OR REPLACE FUNCTION public.validate_production_measurement_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
BEGIN
  IF NEW.measurement_id IS NOT NULL THEN
    SELECT status INTO v_status
    FROM measurements
    WHERE id = NEW.measurement_id;

    IF v_status = 'closed' THEN
      RAISE EXCEPTION 'Não é permitido lançar produção em medição fechada.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_validate_production_measurement_status ON public.production_logs;
CREATE TRIGGER trigger_validate_production_measurement_status
BEFORE INSERT OR UPDATE ON public.production_logs
FOR EACH ROW
EXECUTE FUNCTION public.validate_production_measurement_status();

-- 3) Sincronizar custo realizado da medição
CREATE OR REPLACE FUNCTION public.sync_measurement_realized_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_measurement_id uuid;
  v_total_cost numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_measurement_id := OLD.measurement_id;
  ELSE
    v_measurement_id := NEW.measurement_id;
  END IF;

  IF v_measurement_id IS NOT NULL THEN
    SELECT COALESCE(SUM(cost_realized), 0)
    INTO v_total_cost
    FROM production_logs
    WHERE measurement_id = v_measurement_id
      AND is_initial_database = false;

    UPDATE measurements
    SET realized_cost = v_total_cost,
        updated_at = now()
    WHERE id = v_measurement_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_measurement_realized_cost ON public.production_logs;
CREATE TRIGGER trigger_sync_measurement_realized_cost
AFTER INSERT OR UPDATE OR DELETE ON public.production_logs
FOR EACH ROW
EXECUTE FUNCTION public.sync_measurement_realized_cost();

-- 4) Atualizar status da medição ao registrar produção
CREATE OR REPLACE FUNCTION public.update_measurement_status_on_production_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.measurement_id IS NOT NULL THEN
    UPDATE measurements
    SET status = 'in_progress'
    WHERE id = NEW.measurement_id
      AND status = 'planned';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_measurement_status_on_production_log ON public.production_logs;
CREATE TRIGGER trigger_update_measurement_status_on_production_log
AFTER INSERT ON public.production_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_measurement_status_on_production_log();

-- 5) RPC para lançar produção (padrão)
CREATE OR REPLACE FUNCTION public.create_production_log(
  p_company_id uuid,
  p_project_id uuid,
  p_measurement_id uuid,
  p_service_id uuid,
  p_house_id uuid,
  p_quantity numeric,
  p_cost numeric,
  p_execution_date date DEFAULT CURRENT_DATE,
  p_is_initial_database boolean DEFAULT false,
  p_is_unplanned boolean DEFAULT false,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO production_logs (
    company_id,
    project_id,
    measurement_id,
    service_id,
    house_id,
    quantity_executed,
    cost_realized,
    execution_date,
    is_initial_database,
    is_unplanned,
    notes
  ) VALUES (
    p_company_id,
    p_project_id,
    p_measurement_id,
    p_service_id,
    p_house_id,
    p_quantity,
    p_cost,
    p_execution_date,
    p_is_initial_database,
    p_is_unplanned,
    p_notes
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 6) RLS — multiempresa
ALTER TABLE public.production_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admin full access on production_logs"
  ON public.production_logs
  FOR ALL
  USING (public.is_system_admin(auth.uid()));

CREATE POLICY "Company users view production_logs"
  ON public.production_logs
  FOR SELECT
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Company admins manage production_logs"
  ON public.production_logs
  FOR ALL
  USING (public.is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.is_company_admin(auth.uid(), company_id));