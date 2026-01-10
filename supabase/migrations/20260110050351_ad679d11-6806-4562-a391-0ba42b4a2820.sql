-- =============================================
-- FASE 6B: ENCERRAMENTO DE MEDIÇÃO E CÁLCULO CONSOLIDADO
-- =============================================

-- 1) Função para recalcular totais consolidados da medição
CREATE OR REPLACE FUNCTION public.recalculate_measurement_totals(p_measurement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_planned_cost numeric;
  v_realized_cost numeric;
  v_financial_result numeric;
  v_financial_status text;
  v_revenue_target numeric;
BEGIN
  -- Somar custos dos serviços
  SELECT 
    COALESCE(SUM(planned_cost), 0),
    COALESCE(SUM(realized_cost), 0)
  INTO v_planned_cost, v_realized_cost
  FROM measurement_services
  WHERE measurement_id = p_measurement_id;

  -- Buscar revenue_target da medição
  SELECT COALESCE(revenue_target, 0)
  INTO v_revenue_target
  FROM measurements
  WHERE id = p_measurement_id;

  -- Calcular resultado financeiro
  v_financial_result := v_revenue_target - v_realized_cost;

  -- Determinar status financeiro
  IF v_realized_cost <= v_revenue_target THEN
    v_financial_status := 'positive';
  ELSIF v_realized_cost <= v_revenue_target * 1.05 THEN
    v_financial_status := 'warning';
  ELSE
    v_financial_status := 'negative';
  END IF;

  -- Atualizar medição
  UPDATE measurements
  SET 
    planned_cost = v_planned_cost,
    realized_cost = v_realized_cost,
    financial_result = v_financial_result,
    financial_status = v_financial_status,
    updated_at = now()
  WHERE id = p_measurement_id;
END;
$$;

-- 2) Função para encerrar medição
CREATE OR REPLACE FUNCTION public.close_measurement(
  p_measurement_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_status text;
  v_planned_cost numeric;
  v_realized_cost numeric;
  v_financial_result numeric;
  v_financial_status text;
  v_services_count integer;
  v_production_count integer;
BEGIN
  -- Verificar status atual
  SELECT status INTO v_current_status
  FROM measurements
  WHERE id = p_measurement_id;

  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Medição não encontrada',
      'code', 'NOT_FOUND'
    );
  END IF;

  IF v_current_status = 'closed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Medição já está encerrada',
      'code', 'ALREADY_CLOSED'
    );
  END IF;

  -- Contar serviços e produção
  SELECT COUNT(*) INTO v_services_count
  FROM measurement_services
  WHERE measurement_id = p_measurement_id;

  SELECT COUNT(*) INTO v_production_count
  FROM production_logs
  WHERE measurement_id = p_measurement_id
    AND is_initial_database = false;

  -- Recalcular totais antes de fechar
  PERFORM public.recalculate_measurement_totals(p_measurement_id);

  -- Buscar valores atualizados
  SELECT 
    planned_cost,
    realized_cost,
    financial_result,
    financial_status
  INTO v_planned_cost, v_realized_cost, v_financial_result, v_financial_status
  FROM measurements
  WHERE id = p_measurement_id;

  -- Encerrar medição
  UPDATE measurements
  SET 
    status = 'closed',
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = p_measurement_id;

  RETURN jsonb_build_object(
    'success', true,
    'measurement_id', p_measurement_id,
    'services_count', v_services_count,
    'production_count', v_production_count,
    'planned_cost', v_planned_cost,
    'realized_cost', v_realized_cost,
    'financial_result', v_financial_result,
    'financial_status', v_financial_status
  );
END;
$$;

-- 3) Função para reabrir medição (com validação de permissão)
CREATE OR REPLACE FUNCTION public.reopen_measurement(
  p_measurement_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_status text;
BEGIN
  -- Verificar se é system_admin
  IF NOT public.is_system_admin(auth.uid()) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Apenas administradores do sistema podem reabrir medições',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  -- Verificar status atual
  SELECT status INTO v_current_status
  FROM measurements
  WHERE id = p_measurement_id;

  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Medição não encontrada',
      'code', 'NOT_FOUND'
    );
  END IF;

  IF v_current_status != 'closed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Apenas medições encerradas podem ser reabertas',
      'code', 'NOT_CLOSED'
    );
  END IF;

  -- Reabrir medição
  UPDATE measurements
  SET 
    status = 'in_progress',
    notes = COALESCE(notes, '') || E'\n[REABERTA] ' || p_reason,
    updated_at = now()
  WHERE id = p_measurement_id;

  RETURN jsonb_build_object(
    'success', true,
    'measurement_id', p_measurement_id,
    'reason', p_reason
  );
END;
$$;

-- 4) Função para obter resumo financeiro da medição
CREATE OR REPLACE FUNCTION public.get_measurement_financial_summary(p_measurement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'measurement_id', m.id,
    'measurement_number', m.measurement_number,
    'status', m.status,
    'start_date', m.start_date,
    'end_date', m.end_date,
    'contract_percent_planned', m.contract_percent_planned,
    'revenue_expected', m.revenue_expected,
    'revenue_target', m.revenue_target,
    'planned_cost', m.planned_cost,
    'realized_cost', m.realized_cost,
    'financial_result', m.financial_result,
    'financial_status', m.financial_status,
    'margin_percent', CASE 
      WHEN m.revenue_expected > 0 THEN 
        ROUND(((m.revenue_expected - m.realized_cost) / m.revenue_expected * 100)::numeric, 2)
      ELSE 0 
    END,
    'cost_variance', m.realized_cost - m.planned_cost,
    'cost_variance_percent', CASE 
      WHEN m.planned_cost > 0 THEN 
        ROUND(((m.realized_cost - m.planned_cost) / m.planned_cost * 100)::numeric, 2)
      ELSE 0 
    END,
    'services_summary', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'positive', COUNT(*) FILTER (WHERE service_status = 'positive'),
        'warning', COUNT(*) FILTER (WHERE service_status = 'warning'),
        'negative', COUNT(*) FILTER (WHERE service_status = 'negative'),
        'total_planned_cost', COALESCE(SUM(planned_cost), 0),
        'total_realized_cost', COALESCE(SUM(realized_cost), 0),
        'total_houses', COALESCE(SUM(planned_houses), 0)
      )
      FROM measurement_services
      WHERE measurement_id = m.id
    ),
    'production_summary', (
      SELECT jsonb_build_object(
        'total_logs', COUNT(*),
        'total_cost', COALESCE(SUM(cost_realized), 0),
        'total_quantity', COALESCE(SUM(quantity_executed), 0),
        'distinct_houses', COUNT(DISTINCT house_id),
        'execution_days', COUNT(DISTINCT execution_date)
      )
      FROM production_logs
      WHERE measurement_id = m.id
        AND is_initial_database = false
    )
  )
  INTO v_result
  FROM measurements m
  WHERE m.id = p_measurement_id;

  RETURN COALESCE(v_result, jsonb_build_object('error', 'Medição não encontrada'));
END;
$$;

-- 5) Trigger para recalcular totais ao modificar serviços
CREATE OR REPLACE FUNCTION public.trigger_sync_measurement_from_services()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_measurement_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_measurement_id := OLD.measurement_id;
  ELSE
    v_measurement_id := NEW.measurement_id;
  END IF;

  IF v_measurement_id IS NOT NULL THEN
    PERFORM public.recalculate_measurement_totals(v_measurement_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_measurement_from_services ON public.measurement_services;

CREATE TRIGGER trigger_sync_measurement_from_services
AFTER INSERT OR UPDATE OF planned_cost, realized_cost OR DELETE ON public.measurement_services
FOR EACH ROW
EXECUTE FUNCTION public.trigger_sync_measurement_from_services();

-- 6) Índice para consultas de resumo
CREATE INDEX IF NOT EXISTS idx_production_logs_measurement_date 
ON public.production_logs(measurement_id, execution_date);

CREATE INDEX IF NOT EXISTS idx_measurement_services_status 
ON public.measurement_services(measurement_id, service_status);