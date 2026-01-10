
-- ============================================================
-- PHASE 9: FORECAST DE TÉRMINO, CUSTO FINAL E ALERTAS DE RISCO
-- ============================================================

-- 1) Adicionar campos de forecast em measurement_services
ALTER TABLE public.measurement_services
ADD COLUMN IF NOT EXISTS forecast_end_date date,
ADD COLUMN IF NOT EXISTS forecast_final_cost numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS forecast_risk text DEFAULT 'safe';

-- Adicionar constraint de check para forecast_risk
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'measurement_services_forecast_risk_check'
  ) THEN
    ALTER TABLE public.measurement_services
    ADD CONSTRAINT measurement_services_forecast_risk_check
    CHECK (forecast_risk IN ('safe', 'warning', 'critical'));
  END IF;
END $$;

-- 4) Adicionar campos de forecast em measurements
ALTER TABLE public.measurements
ADD COLUMN IF NOT EXISTS forecast_cost numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS forecast_result numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS forecast_risk text DEFAULT 'safe';

-- Adicionar constraint de check para forecast_risk em measurements
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'measurements_forecast_risk_check'
  ) THEN
    ALTER TABLE public.measurements
    ADD CONSTRAINT measurements_forecast_risk_check
    CHECK (forecast_risk IN ('safe', 'warning', 'critical'));
  END IF;
END $$;

-- 7) Criar tabela risk_alerts
CREATE TABLE IF NOT EXISTS public.risk_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NOT NULL,
  measurement_id uuid REFERENCES public.measurements(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.measurement_services(id) ON DELETE CASCADE,
  level text NOT NULL DEFAULT 'info',
  alert_type text NOT NULL,
  message text NOT NULL,
  is_active boolean DEFAULT true,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT risk_alerts_level_check CHECK (level IN ('info', 'warning', 'critical')),
  CONSTRAINT risk_alerts_type_check CHECK (alert_type IN ('delay', 'cost', 'financial', 'productivity'))
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_risk_alerts_company ON public.risk_alerts(company_id);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_project ON public.risk_alerts(project_id);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_measurement ON public.risk_alerts(measurement_id);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_service ON public.risk_alerts(service_id);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_active ON public.risk_alerts(is_active) WHERE is_active = true;

-- 9) RLS para risk_alerts
ALTER TABLE public.risk_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "System admin full access on risk_alerts" ON public.risk_alerts;
CREATE POLICY "System admin full access on risk_alerts"
ON public.risk_alerts FOR ALL
USING (is_system_admin(auth.uid()));

DROP POLICY IF EXISTS "Company admins manage risk_alerts" ON public.risk_alerts;
CREATE POLICY "Company admins manage risk_alerts"
ON public.risk_alerts FOR ALL
USING (is_company_admin(auth.uid(), company_id))
WITH CHECK (is_company_admin(auth.uid(), company_id));

DROP POLICY IF EXISTS "Company users view risk_alerts" ON public.risk_alerts;
CREATE POLICY "Company users view risk_alerts"
ON public.risk_alerts FOR SELECT
USING (user_belongs_to_company(auth.uid(), company_id));

-- 2) Função recalculate_service_forecast
CREATE OR REPLACE FUNCTION public.recalculate_service_forecast(p_service_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service RECORD;
  v_measurement RECORD;
  v_casas_executadas numeric;
  v_casas_restantes numeric;
  v_dias_restantes numeric;
  v_forecast_end_date date;
  v_custo_unit_real numeric;
  v_forecast_final_cost numeric;
  v_forecast_risk text;
  v_old_risk text;
BEGIN
  -- Buscar dados do serviço
  SELECT ms.*, m.end_date as measurement_end_date, ms.forecast_risk as old_forecast_risk
  INTO v_service
  FROM measurement_services ms
  JOIN measurements m ON m.id = ms.measurement_id
  WHERE ms.id = p_service_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  v_old_risk := v_service.old_forecast_risk;
  
  -- Calcular casas executadas (apenas produção real, não banco inicial)
  SELECT COALESCE(SUM(quantity_executed), 0)
  INTO v_casas_executadas
  FROM production_logs
  WHERE service_id = p_service_id
    AND is_initial_database = false;
  
  -- Casas restantes
  v_casas_restantes := GREATEST(v_service.planned_houses - v_casas_executadas, 0);
  
  -- Calcular forecast_end_date baseado na produtividade real
  IF v_service.productivity_real > 0 AND v_casas_restantes > 0 THEN
    v_dias_restantes := v_casas_restantes / v_service.productivity_real;
    v_forecast_end_date := CURRENT_DATE + CEIL(v_dias_restantes)::integer;
  ELSIF v_casas_restantes = 0 THEN
    -- Serviço concluído
    v_forecast_end_date := CURRENT_DATE;
  ELSE
    -- Sem produtividade real ainda, usar estimativa baseada na planejada
    IF v_service.productivity_expected > 0 THEN
      v_dias_restantes := v_casas_restantes / v_service.productivity_expected;
      v_forecast_end_date := CURRENT_DATE + CEIL(v_dias_restantes)::integer;
    ELSE
      v_forecast_end_date := NULL;
    END IF;
  END IF;
  
  -- Calcular forecast_final_cost
  IF v_casas_executadas > 0 THEN
    v_custo_unit_real := v_service.realized_cost / v_casas_executadas;
    v_forecast_final_cost := v_custo_unit_real * v_service.planned_houses;
  ELSE
    -- Usar custo planejado como estimativa
    v_forecast_final_cost := v_service.planned_cost;
  END IF;
  
  -- Determinar nível de risco
  v_forecast_risk := 'safe';
  
  -- Risco de atraso (warning)
  IF v_forecast_end_date IS NOT NULL AND v_forecast_end_date > v_service.measurement_end_date THEN
    v_forecast_risk := 'warning';
  END IF;
  
  -- Risco de custo (critical) - estouro de 5% ou mais
  IF v_forecast_final_cost > v_service.planned_cost * 1.05 THEN
    v_forecast_risk := 'critical';
  END IF;
  
  -- Atualizar measurement_services
  UPDATE measurement_services
  SET 
    forecast_end_date = v_forecast_end_date,
    forecast_final_cost = v_forecast_final_cost,
    forecast_risk = v_forecast_risk,
    updated_at = now()
  WHERE id = p_service_id;
  
  -- Gerar alerta se risco mudou
  IF v_old_risk IS DISTINCT FROM v_forecast_risk THEN
    PERFORM generate_service_risk_alert(p_service_id, v_forecast_risk);
  END IF;
  
  -- Recalcular forecast da medição
  PERFORM recalculate_measurement_forecast(v_service.measurement_id);
END;
$$;

-- 5) Função recalculate_measurement_forecast
CREATE OR REPLACE FUNCTION public.recalculate_measurement_forecast(p_measurement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_measurement RECORD;
  v_forecast_cost numeric;
  v_forecast_result numeric;
  v_forecast_risk text;
  v_has_critical boolean;
  v_has_warning boolean;
  v_old_risk text;
BEGIN
  -- Buscar medição atual
  SELECT * INTO v_measurement
  FROM measurements
  WHERE id = p_measurement_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  v_old_risk := v_measurement.forecast_risk;
  
  -- Calcular soma dos forecasts dos serviços
  SELECT 
    COALESCE(SUM(forecast_final_cost), 0),
    BOOL_OR(forecast_risk = 'critical'),
    BOOL_OR(forecast_risk = 'warning')
  INTO v_forecast_cost, v_has_critical, v_has_warning
  FROM measurement_services
  WHERE measurement_id = p_measurement_id;
  
  -- Calcular resultado previsto
  v_forecast_result := v_measurement.revenue_target - v_forecast_cost;
  
  -- Determinar risco da medição
  IF v_has_critical THEN
    v_forecast_risk := 'critical';
  ELSIF v_has_warning THEN
    v_forecast_risk := 'warning';
  ELSE
    v_forecast_risk := 'safe';
  END IF;
  
  -- Atualizar measurements
  UPDATE measurements
  SET 
    forecast_cost = v_forecast_cost,
    forecast_result = v_forecast_result,
    forecast_risk = v_forecast_risk,
    updated_at = now()
  WHERE id = p_measurement_id;
  
  -- Gerar alerta se risco mudou
  IF v_old_risk IS DISTINCT FROM v_forecast_risk THEN
    PERFORM generate_measurement_risk_alert(p_measurement_id, v_forecast_risk);
  END IF;
END;
$$;

-- 8) Função para gerar alertas de risco de serviço
CREATE OR REPLACE FUNCTION public.generate_service_risk_alert(
  p_service_id uuid,
  p_new_risk text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service RECORD;
  v_alert_type text;
  v_message text;
  v_days_delay integer;
  v_cost_over numeric;
BEGIN
  -- Buscar dados do serviço
  SELECT 
    ms.*,
    m.company_id,
    m.project_id,
    m.end_date as measurement_end_date
  INTO v_service
  FROM measurement_services ms
  JOIN measurements m ON m.id = ms.measurement_id
  WHERE ms.id = p_service_id;
  
  IF NOT FOUND OR p_new_risk = 'safe' THEN
    -- Desativar alertas anteriores se voltou a safe
    UPDATE risk_alerts
    SET is_active = false, resolved_at = now()
    WHERE service_id = p_service_id AND is_active = true;
    RETURN;
  END IF;
  
  -- Desativar alertas anteriores do mesmo serviço
  UPDATE risk_alerts
  SET is_active = false, resolved_at = now()
  WHERE service_id = p_service_id AND is_active = true;
  
  -- Determinar tipo de alerta e mensagem
  IF v_service.forecast_final_cost > v_service.planned_cost * 1.05 THEN
    v_alert_type := 'cost';
    v_cost_over := v_service.forecast_final_cost - v_service.planned_cost;
    v_message := format(
      'Serviço "%s - %s" com previsão de estouro de custo de R$ %s (%.1f%% acima do planejado)',
      v_service.macro_name,
      v_service.scope_name,
      to_char(v_cost_over, 'FM999G999G999D00'),
      ((v_service.forecast_final_cost / NULLIF(v_service.planned_cost, 0)) - 1) * 100
    );
  ELSIF v_service.forecast_end_date > v_service.measurement_end_date THEN
    v_alert_type := 'delay';
    v_days_delay := v_service.forecast_end_date - v_service.measurement_end_date;
    v_message := format(
      'Serviço "%s - %s" com previsão de atraso de %s dias',
      v_service.macro_name,
      v_service.scope_name,
      v_days_delay
    );
  ELSE
    v_alert_type := 'productivity';
    v_message := format(
      'Serviço "%s - %s" com produtividade abaixo do esperado',
      v_service.macro_name,
      v_service.scope_name
    );
  END IF;
  
  -- Inserir novo alerta
  INSERT INTO risk_alerts (
    company_id,
    project_id,
    measurement_id,
    service_id,
    level,
    alert_type,
    message
  ) VALUES (
    v_service.company_id,
    v_service.project_id,
    v_service.measurement_id,
    p_service_id,
    p_new_risk,
    v_alert_type,
    v_message
  );
END;
$$;

-- Função para gerar alertas de risco de medição
CREATE OR REPLACE FUNCTION public.generate_measurement_risk_alert(
  p_measurement_id uuid,
  p_new_risk text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_measurement RECORD;
  v_message text;
BEGIN
  -- Buscar dados da medição
  SELECT * INTO v_measurement
  FROM measurements
  WHERE id = p_measurement_id;
  
  IF NOT FOUND OR p_new_risk = 'safe' THEN
    -- Desativar alertas anteriores se voltou a safe
    UPDATE risk_alerts
    SET is_active = false, resolved_at = now()
    WHERE measurement_id = p_measurement_id 
      AND service_id IS NULL 
      AND is_active = true;
    RETURN;
  END IF;
  
  -- Desativar alertas anteriores da mesma medição (nível medição)
  UPDATE risk_alerts
  SET is_active = false, resolved_at = now()
  WHERE measurement_id = p_measurement_id 
    AND service_id IS NULL 
    AND is_active = true;
  
  -- Criar mensagem
  IF v_measurement.forecast_result < 0 THEN
    v_message := format(
      'Medição %s com previsão de resultado negativo: R$ %s',
      v_measurement.measurement_number,
      to_char(v_measurement.forecast_result, 'FM999G999G999D00')
    );
  ELSE
    v_message := format(
      'Medição %s com riscos identificados em serviços',
      v_measurement.measurement_number
    );
  END IF;
  
  -- Inserir novo alerta
  INSERT INTO risk_alerts (
    company_id,
    project_id,
    measurement_id,
    service_id,
    level,
    alert_type,
    message
  ) VALUES (
    v_measurement.company_id,
    v_measurement.project_id,
    p_measurement_id,
    NULL,
    p_new_risk,
    'financial',
    v_message
  );
END;
$$;

-- 3) Trigger para recalcular forecast após mudanças em production_logs
CREATE OR REPLACE FUNCTION public.trigger_recalc_forecast_on_production()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.service_id IS NOT NULL THEN
      PERFORM recalculate_service_forecast(OLD.service_id);
    END IF;
    RETURN OLD;
  ELSE
    IF NEW.service_id IS NOT NULL THEN
      PERFORM recalculate_service_forecast(NEW.service_id);
    END IF;
    -- Se mudou de serviço, recalcular o antigo também
    IF TG_OP = 'UPDATE' AND OLD.service_id IS DISTINCT FROM NEW.service_id AND OLD.service_id IS NOT NULL THEN
      PERFORM recalculate_service_forecast(OLD.service_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_forecast_production ON public.production_logs;
CREATE TRIGGER trg_recalc_forecast_production
AFTER INSERT OR UPDATE OR DELETE ON public.production_logs
FOR EACH ROW
EXECUTE FUNCTION trigger_recalc_forecast_on_production();

-- 6) Trigger para recalcular forecast após mudanças em measurement_services
CREATE OR REPLACE FUNCTION public.trigger_recalc_forecast_on_service_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recalcular se campos relevantes mudaram
  IF TG_OP = 'UPDATE' AND (
    OLD.planned_houses IS DISTINCT FROM NEW.planned_houses OR
    OLD.planned_cost IS DISTINCT FROM NEW.planned_cost OR
    OLD.productivity_expected IS DISTINCT FROM NEW.productivity_expected OR
    OLD.teams_expected IS DISTINCT FROM NEW.teams_expected OR
    OLD.productivity_real IS DISTINCT FROM NEW.productivity_real OR
    OLD.realized_cost IS DISTINCT FROM NEW.realized_cost
  ) THEN
    PERFORM recalculate_service_forecast(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_forecast_service ON public.measurement_services;
CREATE TRIGGER trg_recalc_forecast_service
AFTER UPDATE ON public.measurement_services
FOR EACH ROW
EXECUTE FUNCTION trigger_recalc_forecast_on_service_change();

-- RPC para obter alertas ativos de um projeto
CREATE OR REPLACE FUNCTION public.get_project_risk_alerts(p_project_id uuid)
RETURNS TABLE (
  id uuid,
  level text,
  alert_type text,
  message text,
  measurement_number integer,
  service_name text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ra.id,
    ra.level,
    ra.alert_type,
    ra.message,
    m.measurement_number,
    CASE 
      WHEN ms.id IS NOT NULL THEN ms.macro_name || ' - ' || ms.scope_name
      ELSE NULL
    END as service_name,
    ra.created_at
  FROM risk_alerts ra
  LEFT JOIN measurements m ON m.id = ra.measurement_id
  LEFT JOIN measurement_services ms ON ms.id = ra.service_id
  WHERE ra.project_id = p_project_id
    AND ra.is_active = true
  ORDER BY 
    CASE ra.level 
      WHEN 'critical' THEN 1 
      WHEN 'warning' THEN 2 
      ELSE 3 
    END,
    ra.created_at DESC;
END;
$$;

-- RPC para resolver um alerta
CREATE OR REPLACE FUNCTION public.resolve_risk_alert(
  p_alert_id uuid,
  p_resolved_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE risk_alerts
  SET 
    is_active = false,
    resolved_at = now(),
    resolved_by = COALESCE(p_resolved_by, auth.uid())
  WHERE id = p_alert_id;
END;
$$;

-- Função para recalcular todos os forecasts de um projeto
CREATE OR REPLACE FUNCTION public.recalculate_project_forecasts(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_id uuid;
BEGIN
  -- Recalcular todos os serviços do projeto
  FOR v_service_id IN 
    SELECT ms.id 
    FROM measurement_services ms
    JOIN measurements m ON m.id = ms.measurement_id
    WHERE m.project_id = p_project_id
  LOOP
    PERFORM recalculate_service_forecast(v_service_id);
  END LOOP;
END;
$$;
