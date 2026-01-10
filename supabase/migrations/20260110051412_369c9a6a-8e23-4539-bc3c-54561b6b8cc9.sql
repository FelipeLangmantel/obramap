-- =====================================================
-- FASE 7A.1: VÍNCULO SIMULADOR ↔ EXECUÇÃO
-- Permite comparar planning_periods com measurements reais
-- =====================================================

-- 1) Adicionar coluna planning_period_id em measurements
ALTER TABLE public.measurements 
ADD COLUMN IF NOT EXISTS planning_period_id uuid REFERENCES public.planning_periods(id) ON DELETE SET NULL;

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_measurements_planning_period 
ON public.measurements(planning_period_id) 
WHERE planning_period_id IS NOT NULL;

-- 2) Função RPC para vincular medição a período de planejamento
CREATE OR REPLACE FUNCTION public.link_measurement_to_planning_period(
  p_measurement_id uuid,
  p_planning_period_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_measurement record;
  v_planning_period record;
  v_result jsonb;
BEGIN
  -- Buscar medição
  SELECT id, company_id, project_id, status, measurement_number
  INTO v_measurement
  FROM public.measurements
  WHERE id = p_measurement_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Medição não encontrada'
    );
  END IF;
  
  -- Verificar se medição está fechada
  IF v_measurement.status = 'closed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Não é possível vincular medição fechada. Reabra primeiro se necessário.'
    );
  END IF;
  
  -- Se for para desvincular (null), apenas atualiza
  IF p_planning_period_id IS NULL THEN
    UPDATE public.measurements
    SET planning_period_id = NULL,
        updated_at = now()
    WHERE id = p_measurement_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Medição desvinculada do período de planejamento',
      'measurement_id', p_measurement_id
    );
  END IF;
  
  -- Buscar período de planejamento
  SELECT pp.id, pp.company_id, pp.project_id, pp.period_number,
         pv.name as version_name
  INTO v_planning_period
  FROM public.planning_periods pp
  JOIN public.planning_versions pv ON pp.planning_version_id = pv.id
  WHERE pp.id = p_planning_period_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Período de planejamento não encontrado'
    );
  END IF;
  
  -- Verificar se company_id e project_id são iguais
  IF v_measurement.company_id != v_planning_period.company_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Empresa da medição não corresponde ao período de planejamento'
    );
  END IF;
  
  IF v_measurement.project_id != v_planning_period.project_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Projeto da medição não corresponde ao período de planejamento'
    );
  END IF;
  
  -- Vincular
  UPDATE public.measurements
  SET planning_period_id = p_planning_period_id,
      updated_at = now()
  WHERE id = p_measurement_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', format('Medição #%s vinculada ao período %s (%s)',
                      v_measurement.measurement_number,
                      v_planning_period.period_number,
                      v_planning_period.version_name),
    'measurement_id', p_measurement_id,
    'planning_period_id', p_planning_period_id
  );
END;
$$;

-- 3) Função helper para comparar medição vs planejamento
CREATE OR REPLACE FUNCTION public.get_measurement_vs_planning(
  p_measurement_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_measurement record;
  v_planning_period record;
  v_planning_services jsonb;
  v_measurement_services jsonb;
  v_comparison jsonb;
BEGIN
  -- Buscar medição com dados completos
  SELECT 
    m.id,
    m.measurement_number,
    m.status,
    m.start_date,
    m.end_date,
    m.planned_cost,
    m.realized_cost,
    m.revenue_expected,
    m.revenue_target,
    m.financial_result,
    m.financial_status,
    m.planning_period_id,
    m.company_id,
    m.project_id,
    p.name as project_name
  INTO v_measurement
  FROM public.measurements m
  JOIN public.projects p ON m.project_id = p.id
  WHERE m.id = p_measurement_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Medição não encontrada'
    );
  END IF;
  
  -- Se não tem período vinculado
  IF v_measurement.planning_period_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'has_planning_link', false,
      'measurement', jsonb_build_object(
        'id', v_measurement.id,
        'number', v_measurement.measurement_number,
        'status', v_measurement.status,
        'start_date', v_measurement.start_date,
        'end_date', v_measurement.end_date,
        'planned_cost', v_measurement.planned_cost,
        'realized_cost', v_measurement.realized_cost,
        'revenue_expected', v_measurement.revenue_expected,
        'revenue_target', v_measurement.revenue_target,
        'financial_result', v_measurement.financial_result,
        'financial_status', v_measurement.financial_status
      ),
      'planning_period', null,
      'comparison', null,
      'message', 'Medição não vinculada a nenhum período de planejamento'
    );
  END IF;
  
  -- Buscar período de planejamento vinculado
  SELECT 
    pp.id,
    pp.period_number,
    pp.start_date,
    pp.end_date,
    pp.contract_percent,
    pp.revenue_expected as planned_revenue,
    pp.revenue_target as planned_revenue_target,
    pp.planned_cost_estimate,
    pp.financial_balance_estimate,
    pv.name as version_name,
    pv.is_active as version_is_active
  INTO v_planning_period
  FROM public.planning_periods pp
  JOIN public.planning_versions pv ON pp.planning_version_id = pv.id
  WHERE pp.id = v_measurement.planning_period_id;
  
  -- Buscar serviços planejados do período
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'scope_id', ps.scope_id,
    'scope_name', ps.scope_name,
    'macro_id', ps.macro_id,
    'macro_name', ps.macro_name,
    'planned_houses', ps.planned_houses,
    'estimated_cost', ps.estimated_cost,
    'productivity_expected', ps.productivity_expected,
    'teams_expected', ps.teams_expected
  ) ORDER BY ps.scope_name, ps.macro_name), '[]'::jsonb)
  INTO v_planning_services
  FROM public.planning_services ps
  WHERE ps.planning_period_id = v_measurement.planning_period_id;
  
  -- Buscar serviços reais da medição
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'scope_id', ms.scope_id,
    'scope_name', ms.scope_name,
    'macro_id', ms.macro_id,
    'macro_name', ms.macro_name,
    'planned_houses', ms.planned_houses,
    'planned_cost', ms.planned_cost,
    'realized_cost', ms.realized_cost,
    'productivity_expected', ms.productivity_expected,
    'productivity_real', ms.productivity_real,
    'service_status', ms.service_status
  ) ORDER BY ms.scope_name, ms.macro_name), '[]'::jsonb)
  INTO v_measurement_services
  FROM public.measurement_services ms
  WHERE ms.measurement_id = p_measurement_id;
  
  -- Calcular comparação
  v_comparison := jsonb_build_object(
    -- Desvio de custo
    'cost_planned', v_planning_period.planned_cost_estimate,
    'cost_actual', v_measurement.realized_cost,
    'cost_deviation', v_measurement.realized_cost - v_planning_period.planned_cost_estimate,
    'cost_deviation_percent', CASE 
      WHEN v_planning_period.planned_cost_estimate > 0 
      THEN ROUND(((v_measurement.realized_cost - v_planning_period.planned_cost_estimate) / v_planning_period.planned_cost_estimate * 100)::numeric, 2)
      ELSE 0 
    END,
    
    -- Desvio de receita
    'revenue_planned', v_planning_period.planned_revenue,
    'revenue_actual', v_measurement.revenue_expected,
    'revenue_deviation', v_measurement.revenue_expected - v_planning_period.planned_revenue,
    'revenue_deviation_percent', CASE 
      WHEN v_planning_period.planned_revenue > 0 
      THEN ROUND(((v_measurement.revenue_expected - v_planning_period.planned_revenue) / v_planning_period.planned_revenue * 100)::numeric, 2)
      ELSE 0 
    END,
    
    -- Desvio de saldo/resultado
    'balance_planned', v_planning_period.financial_balance_estimate,
    'balance_actual', v_measurement.financial_result,
    'balance_deviation', v_measurement.financial_result - v_planning_period.financial_balance_estimate,
    'balance_deviation_percent', CASE 
      WHEN v_planning_period.financial_balance_estimate != 0 
      THEN ROUND(((v_measurement.financial_result - v_planning_period.financial_balance_estimate) / ABS(v_planning_period.financial_balance_estimate) * 100)::numeric, 2)
      ELSE 0 
    END,
    
    -- Análise qualitativa
    'cost_status', CASE
      WHEN v_measurement.realized_cost <= v_planning_period.planned_cost_estimate THEN 'under_budget'
      WHEN v_measurement.realized_cost <= v_planning_period.planned_cost_estimate * 1.1 THEN 'slight_overrun'
      ELSE 'over_budget'
    END,
    'revenue_status', CASE
      WHEN v_measurement.revenue_expected >= v_planning_period.planned_revenue THEN 'on_target'
      WHEN v_measurement.revenue_expected >= v_planning_period.planned_revenue * 0.9 THEN 'slight_shortfall'
      ELSE 'below_target'
    END,
    'overall_assessment', CASE
      WHEN v_measurement.financial_result >= v_planning_period.financial_balance_estimate THEN 'positive'
      WHEN v_measurement.financial_result >= v_planning_period.financial_balance_estimate * 0.9 THEN 'acceptable'
      ELSE 'needs_attention'
    END
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'has_planning_link', true,
    'measurement', jsonb_build_object(
      'id', v_measurement.id,
      'number', v_measurement.measurement_number,
      'status', v_measurement.status,
      'start_date', v_measurement.start_date,
      'end_date', v_measurement.end_date,
      'planned_cost', v_measurement.planned_cost,
      'realized_cost', v_measurement.realized_cost,
      'revenue_expected', v_measurement.revenue_expected,
      'revenue_target', v_measurement.revenue_target,
      'financial_result', v_measurement.financial_result,
      'financial_status', v_measurement.financial_status,
      'services', v_measurement_services
    ),
    'planning_period', jsonb_build_object(
      'id', v_planning_period.id,
      'period_number', v_planning_period.period_number,
      'version_name', v_planning_period.version_name,
      'version_is_active', v_planning_period.version_is_active,
      'start_date', v_planning_period.start_date,
      'end_date', v_planning_period.end_date,
      'contract_percent', v_planning_period.contract_percent,
      'revenue_expected', v_planning_period.planned_revenue,
      'revenue_target', v_planning_period.planned_revenue_target,
      'planned_cost_estimate', v_planning_period.planned_cost_estimate,
      'financial_balance_estimate', v_planning_period.financial_balance_estimate,
      'services', v_planning_services
    ),
    'comparison', v_comparison
  );
END;
$$;

-- 4) Função para obter resumo comparativo de uma versão de planejamento
CREATE OR REPLACE FUNCTION public.get_planning_version_execution_summary(
  p_version_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version record;
  v_periods_summary jsonb;
  v_totals record;
BEGIN
  -- Buscar versão
  SELECT id, name, project_id, company_id, is_active
  INTO v_version
  FROM public.planning_versions
  WHERE id = p_version_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Versão de planejamento não encontrada'
    );
  END IF;
  
  -- Buscar resumo por período com medições vinculadas
  SELECT COALESCE(jsonb_agg(period_data ORDER BY period_data->>'period_number'), '[]'::jsonb)
  INTO v_periods_summary
  FROM (
    SELECT jsonb_build_object(
      'period_id', pp.id,
      'period_number', pp.period_number,
      'start_date', pp.start_date,
      'end_date', pp.end_date,
      'contract_percent', pp.contract_percent,
      -- Planejado
      'planned_revenue', pp.revenue_expected,
      'planned_cost', pp.planned_cost_estimate,
      'planned_balance', pp.financial_balance_estimate,
      -- Realizado (da medição vinculada, se existir)
      'has_measurement', m.id IS NOT NULL,
      'measurement_id', m.id,
      'measurement_number', m.measurement_number,
      'measurement_status', m.status,
      'actual_revenue', COALESCE(m.revenue_expected, 0),
      'actual_cost', COALESCE(m.realized_cost, 0),
      'actual_balance', COALESCE(m.financial_result, 0),
      -- Desvios
      'revenue_deviation', COALESCE(m.revenue_expected, 0) - pp.revenue_expected,
      'cost_deviation', COALESCE(m.realized_cost, 0) - pp.planned_cost_estimate,
      'balance_deviation', COALESCE(m.financial_result, 0) - pp.financial_balance_estimate
    ) as period_data
    FROM public.planning_periods pp
    LEFT JOIN public.measurements m ON m.planning_period_id = pp.id
    WHERE pp.planning_version_id = p_version_id
  ) sub;
  
  -- Calcular totais
  SELECT 
    SUM(pp.revenue_expected) as total_planned_revenue,
    SUM(pp.planned_cost_estimate) as total_planned_cost,
    SUM(pp.financial_balance_estimate) as total_planned_balance,
    SUM(COALESCE(m.revenue_expected, 0)) as total_actual_revenue,
    SUM(COALESCE(m.realized_cost, 0)) as total_actual_cost,
    SUM(COALESCE(m.financial_result, 0)) as total_actual_balance,
    COUNT(pp.id) as total_periods,
    COUNT(m.id) as periods_with_measurements
  INTO v_totals
  FROM public.planning_periods pp
  LEFT JOIN public.measurements m ON m.planning_period_id = pp.id
  WHERE pp.planning_version_id = p_version_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'version', jsonb_build_object(
      'id', v_version.id,
      'name', v_version.name,
      'project_id', v_version.project_id,
      'is_active', v_version.is_active
    ),
    'periods', v_periods_summary,
    'totals', jsonb_build_object(
      'total_periods', v_totals.total_periods,
      'periods_with_measurements', v_totals.periods_with_measurements,
      'execution_progress_percent', CASE 
        WHEN v_totals.total_periods > 0 
        THEN ROUND((v_totals.periods_with_measurements::numeric / v_totals.total_periods * 100), 1)
        ELSE 0 
      END,
      -- Planejado
      'planned_revenue', v_totals.total_planned_revenue,
      'planned_cost', v_totals.total_planned_cost,
      'planned_balance', v_totals.total_planned_balance,
      -- Realizado
      'actual_revenue', v_totals.total_actual_revenue,
      'actual_cost', v_totals.total_actual_cost,
      'actual_balance', v_totals.total_actual_balance,
      -- Desvios
      'revenue_deviation', v_totals.total_actual_revenue - v_totals.total_planned_revenue,
      'cost_deviation', v_totals.total_actual_cost - v_totals.total_planned_cost,
      'balance_deviation', v_totals.total_actual_balance - v_totals.total_planned_balance,
      -- Análise
      'planning_accuracy', jsonb_build_object(
        'cost_accuracy_percent', CASE 
          WHEN v_totals.total_planned_cost > 0 AND v_totals.periods_with_measurements > 0
          THEN ROUND((1 - ABS(v_totals.total_actual_cost - v_totals.total_planned_cost) / v_totals.total_planned_cost) * 100, 1)
          ELSE null 
        END,
        'revenue_accuracy_percent', CASE 
          WHEN v_totals.total_planned_revenue > 0 AND v_totals.periods_with_measurements > 0
          THEN ROUND((1 - ABS(v_totals.total_actual_revenue - v_totals.total_planned_revenue) / v_totals.total_planned_revenue) * 100, 1)
          ELSE null 
        END
      )
    )
  );
END;
$$;

-- Comentários
COMMENT ON COLUMN public.measurements.planning_period_id IS 'Vincula medição real a um período do planejamento simulado para comparação';
COMMENT ON FUNCTION public.link_measurement_to_planning_period IS 'Vincula uma medição a um período de planejamento para comparação previsto vs realizado';
COMMENT ON FUNCTION public.get_measurement_vs_planning IS 'Retorna comparação detalhada entre medição real e período planejado vinculado';
COMMENT ON FUNCTION public.get_planning_version_execution_summary IS 'Resumo de execução de uma versão de planejamento com todas as medições vinculadas';