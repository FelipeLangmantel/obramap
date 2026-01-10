-- =====================================================
-- FASE 7B: DASHBOARDS PARA TOMADA DE DECISÃO
-- =====================================================

-- =====================================================
-- 7B.1 — DASHBOARD GERAL DA OBRA (EXECUTIVO)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_project_execution_dashboard(
  p_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project record;
  v_contract record;
  v_active_version record;
  v_totals record;
  v_periods_status record;
  v_measurements_summary jsonb;
BEGIN
  -- Buscar projeto
  SELECT id, name, total_houses, start_date, expected_end_date, company_id
  INTO v_project
  FROM public.projects
  WHERE id = p_project_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Projeto não encontrado');
  END IF;
  
  -- Buscar contrato
  SELECT contract_value_total, cost_target_percent
  INTO v_contract
  FROM public.project_contracts
  WHERE project_id = p_project_id;
  
  -- Buscar versão ativa de planejamento
  SELECT pv.id, pv.name, pv.version_number
  INTO v_active_version
  FROM public.planning_versions pv
  WHERE pv.project_id = p_project_id AND pv.is_active = true
  LIMIT 1;
  
  -- Calcular totais (períodos planejados vs medições reais)
  SELECT
    -- Planejado (da versão ativa)
    COALESCE(SUM(pp.revenue_expected), 0) as total_planned_revenue,
    COALESCE(SUM(pp.planned_cost_estimate), 0) as total_planned_cost,
    COALESCE(SUM(pp.financial_balance_estimate), 0) as total_planned_balance,
    COUNT(pp.id) as total_periods,
    COUNT(CASE WHEN pp.is_executed THEN 1 END) as executed_periods,
    -- Realizado (das medições vinculadas)
    COALESCE(SUM(CASE WHEN m.id IS NOT NULL THEN m.revenue_expected ELSE 0 END), 0) as total_actual_revenue,
    COALESCE(SUM(CASE WHEN m.id IS NOT NULL THEN m.realized_cost ELSE 0 END), 0) as total_actual_cost,
    COALESCE(SUM(CASE WHEN m.id IS NOT NULL THEN m.financial_result ELSE 0 END), 0) as total_actual_balance,
    -- Progresso do contrato
    COALESCE(SUM(pp.contract_percent), 0) as total_contract_planned,
    COALESCE(SUM(CASE WHEN pp.is_executed THEN pp.contract_percent ELSE 0 END), 0) as total_contract_executed
  INTO v_totals
  FROM public.planning_periods pp
  LEFT JOIN public.measurements m ON m.planning_period_id = pp.id
  WHERE pp.planning_version_id = v_active_version.id;
  
  -- Calcular status dos períodos (verde/amarelo/vermelho)
  SELECT
    COUNT(CASE WHEN status = 'green' THEN 1 END) as green_count,
    COUNT(CASE WHEN status = 'yellow' THEN 1 END) as yellow_count,
    COUNT(CASE WHEN status = 'red' THEN 1 END) as red_count
  INTO v_periods_status
  FROM (
    SELECT 
      CASE
        -- Verde: saldo real >= saldo planejado
        WHEN m.financial_result >= pp.financial_balance_estimate THEN 'green'
        -- Amarelo: saldo real >= 90% do planejado
        WHEN m.financial_result >= pp.financial_balance_estimate * 0.9 THEN 'yellow'
        -- Vermelho: saldo real < 90% do planejado
        ELSE 'red'
      END as status
    FROM public.planning_periods pp
    JOIN public.measurements m ON m.planning_period_id = pp.id
    WHERE pp.planning_version_id = v_active_version.id
  ) sub;
  
  -- Resumo das últimas medições
  SELECT COALESCE(jsonb_agg(measurement_data ORDER BY measurement_data->>'measurement_number' DESC), '[]'::jsonb)
  INTO v_measurements_summary
  FROM (
    SELECT jsonb_build_object(
      'id', m.id,
      'measurement_number', m.measurement_number,
      'status', m.status,
      'start_date', m.start_date,
      'end_date', m.end_date,
      'planned_cost', m.planned_cost,
      'realized_cost', m.realized_cost,
      'financial_result', m.financial_result,
      'financial_status', m.financial_status,
      'has_planning_link', m.planning_period_id IS NOT NULL
    ) as measurement_data
    FROM public.measurements m
    WHERE m.project_id = p_project_id
    ORDER BY m.measurement_number DESC
    LIMIT 5
  ) sub;
  
  RETURN jsonb_build_object(
    'success', true,
    'project', jsonb_build_object(
      'id', v_project.id,
      'name', v_project.name,
      'total_houses', v_project.total_houses,
      'start_date', v_project.start_date,
      'expected_end_date', v_project.expected_end_date
    ),
    'contract', jsonb_build_object(
      'value_total', COALESCE(v_contract.contract_value_total, 0),
      'cost_target_percent', COALESCE(v_contract.cost_target_percent, 68)
    ),
    'planning_version', CASE WHEN v_active_version.id IS NOT NULL THEN
      jsonb_build_object(
        'id', v_active_version.id,
        'name', v_active_version.name,
        'version_number', v_active_version.version_number
      )
    ELSE null END,
    'totals', jsonb_build_object(
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
      -- Percentuais
      'revenue_achievement_percent', CASE 
        WHEN v_totals.total_planned_revenue > 0 
        THEN ROUND((v_totals.total_actual_revenue / v_totals.total_planned_revenue * 100)::numeric, 1)
        ELSE 0 
      END,
      'cost_efficiency_percent', CASE 
        WHEN v_totals.total_actual_cost > 0 AND v_totals.total_actual_revenue > 0
        THEN ROUND((v_totals.total_actual_cost / v_totals.total_actual_revenue * 100)::numeric, 1)
        ELSE 0 
      END
    ),
    'periods_status', jsonb_build_object(
      'total', COALESCE(v_totals.total_periods, 0),
      'executed', COALESCE(v_totals.executed_periods, 0),
      'pending', COALESCE(v_totals.total_periods - v_totals.executed_periods, 0),
      'green', COALESCE(v_periods_status.green_count, 0),
      'yellow', COALESCE(v_periods_status.yellow_count, 0),
      'red', COALESCE(v_periods_status.red_count, 0)
    ),
    'progress_percent', CASE 
      WHEN v_totals.total_contract_planned > 0 
      THEN ROUND((v_totals.total_contract_executed / v_totals.total_contract_planned * 100)::numeric, 1)
      ELSE 0 
    END,
    'recent_measurements', v_measurements_summary
  );
END;
$$;

-- =====================================================
-- 7B.2 — DASHBOARD POR MEDIÇÃO (OPERACIONAL)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_measurement_dashboard(
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
  v_services_summary jsonb;
  v_critical_services jsonb;
  v_productivity_summary jsonb;
BEGIN
  -- Buscar medição
  SELECT 
    m.*,
    p.name as project_name,
    p.total_houses
  INTO v_measurement
  FROM public.measurements m
  JOIN public.projects p ON p.id = m.project_id
  WHERE m.id = p_measurement_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Medição não encontrada');
  END IF;
  
  -- Buscar período planejado vinculado (se existir)
  IF v_measurement.planning_period_id IS NOT NULL THEN
    SELECT 
      pp.*,
      pv.name as version_name
    INTO v_planning_period
    FROM public.planning_periods pp
    JOIN public.planning_versions pv ON pp.planning_version_id = pv.id
    WHERE pp.id = v_measurement.planning_period_id;
  END IF;
  
  -- Resumo dos serviços
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'positive', COUNT(CASE WHEN service_status = 'positive' THEN 1 END),
    'warning', COUNT(CASE WHEN service_status = 'warning' THEN 1 END),
    'negative', COUNT(CASE WHEN service_status = 'negative' THEN 1 END),
    'total_planned_cost', COALESCE(SUM(planned_cost), 0),
    'total_realized_cost', COALESCE(SUM(realized_cost), 0),
    'total_financial_result', COALESCE(SUM(financial_result), 0)
  )
  INTO v_services_summary
  FROM public.measurement_services
  WHERE measurement_id = p_measurement_id;
  
  -- Serviços críticos (negativos ou warning, ordenados por impacto)
  SELECT COALESCE(jsonb_agg(service_data ORDER BY service_data->>'financial_result' ASC), '[]'::jsonb)
  INTO v_critical_services
  FROM (
    SELECT jsonb_build_object(
      'id', id,
      'scope_name', scope_name,
      'macro_name', macro_name,
      'macro_color', macro_color,
      'planned_houses', planned_houses,
      'planned_cost', planned_cost,
      'realized_cost', realized_cost,
      'financial_result', financial_result,
      'service_status', service_status,
      'productivity_expected', productivity_expected,
      'productivity_real', productivity_real,
      'productivity_variance_percent', CASE 
        WHEN productivity_expected > 0 
        THEN ROUND(((productivity_real - productivity_expected) / productivity_expected * 100)::numeric, 1)
        ELSE 0 
      END
    ) as service_data
    FROM public.measurement_services
    WHERE measurement_id = p_measurement_id
      AND service_status IN ('warning', 'negative')
    ORDER BY financial_result ASC
    LIMIT 10
  ) sub;
  
  -- Resumo de produtividade
  SELECT jsonb_build_object(
    'avg_expected', ROUND(COALESCE(AVG(productivity_expected), 0)::numeric, 2),
    'avg_real', ROUND(COALESCE(AVG(NULLIF(productivity_real, 0)), 0)::numeric, 2),
    'services_above_target', COUNT(CASE WHEN productivity_real >= productivity_expected THEN 1 END),
    'services_below_target', COUNT(CASE WHEN productivity_real < productivity_expected AND productivity_real > 0 THEN 1 END),
    'services_not_measured', COUNT(CASE WHEN productivity_real = 0 THEN 1 END)
  )
  INTO v_productivity_summary
  FROM public.measurement_services
  WHERE measurement_id = p_measurement_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'measurement', jsonb_build_object(
      'id', v_measurement.id,
      'number', v_measurement.measurement_number,
      'status', v_measurement.status,
      'start_date', v_measurement.start_date,
      'end_date', v_measurement.end_date,
      'project_name', v_measurement.project_name
    ),
    'financials', jsonb_build_object(
      -- Medição real
      'planned_cost', v_measurement.planned_cost,
      'realized_cost', v_measurement.realized_cost,
      'revenue_expected', v_measurement.revenue_expected,
      'revenue_target', v_measurement.revenue_target,
      'financial_result', v_measurement.financial_result,
      'financial_status', v_measurement.financial_status,
      -- Comparação com planejamento (se vinculado)
      'has_planning_link', v_measurement.planning_period_id IS NOT NULL,
      'planning_period_number', v_planning_period.period_number,
      'planning_version_name', v_planning_period.version_name,
      'planning_cost', v_planning_period.planned_cost_estimate,
      'planning_revenue', v_planning_period.revenue_expected,
      'planning_balance', v_planning_period.financial_balance_estimate,
      -- Desvios do planejamento
      'cost_vs_planning', CASE 
        WHEN v_planning_period.id IS NOT NULL 
        THEN v_measurement.realized_cost - v_planning_period.planned_cost_estimate
        ELSE null 
      END,
      'revenue_vs_planning', CASE 
        WHEN v_planning_period.id IS NOT NULL 
        THEN v_measurement.revenue_expected - v_planning_period.revenue_expected
        ELSE null 
      END,
      'balance_vs_planning', CASE 
        WHEN v_planning_period.id IS NOT NULL 
        THEN v_measurement.financial_result - v_planning_period.financial_balance_estimate
        ELSE null 
      END
    ),
    'services', v_services_summary,
    'critical_services', v_critical_services,
    'productivity', v_productivity_summary,
    'alerts', jsonb_build_object(
      'cost_overrun', v_measurement.realized_cost > v_measurement.planned_cost,
      'below_revenue_target', v_measurement.revenue_expected < v_measurement.revenue_target,
      'negative_result', v_measurement.financial_result < 0,
      'planning_deviation', CASE 
        WHEN v_planning_period.id IS NOT NULL 
        THEN v_measurement.financial_result < v_planning_period.financial_balance_estimate * 0.9
        ELSE false 
      END
    )
  );
END;
$$;

-- =====================================================
-- 7B.3 — COMPARAR CENÁRIOS DE PLANEJAMENTO
-- =====================================================
CREATE OR REPLACE FUNCTION public.compare_planning_versions(
  p_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project record;
  v_contract record;
  v_versions_comparison jsonb;
BEGIN
  -- Buscar projeto
  SELECT id, name, total_houses, start_date, expected_end_date
  INTO v_project
  FROM public.projects
  WHERE id = p_project_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Projeto não encontrado');
  END IF;
  
  -- Buscar contrato
  SELECT contract_value_total, cost_target_percent
  INTO v_contract
  FROM public.project_contracts
  WHERE project_id = p_project_id;
  
  -- Comparar todas as versões do projeto
  SELECT COALESCE(jsonb_agg(version_data ORDER BY version_data->>'is_active' DESC, version_data->>'version_number' ASC), '[]'::jsonb)
  INTO v_versions_comparison
  FROM (
    SELECT jsonb_build_object(
      'id', pv.id,
      'name', pv.name,
      'version_number', pv.version_number,
      'is_active', pv.is_active,
      'created_at', pv.created_at,
      -- Totais do cenário
      'total_periods', periods.total_periods,
      'executed_periods', periods.executed_periods,
      'total_revenue', periods.total_revenue,
      'total_cost', periods.total_cost,
      'total_balance', periods.total_balance,
      -- Datas estimadas
      'first_period_start', periods.first_period_start,
      'last_period_end', periods.last_period_end,
      'duration_days', periods.duration_days,
      -- Métricas financeiras
      'margin_percent', CASE 
        WHEN periods.total_revenue > 0 
        THEN ROUND(((periods.total_revenue - periods.total_cost) / periods.total_revenue * 100)::numeric, 1)
        ELSE 0 
      END,
      'cost_percent', CASE 
        WHEN periods.total_revenue > 0 
        THEN ROUND((periods.total_cost / periods.total_revenue * 100)::numeric, 1)
        ELSE 0 
      END,
      'within_cost_target', CASE 
        WHEN periods.total_revenue > 0 AND COALESCE(v_contract.cost_target_percent, 68) > 0
        THEN (periods.total_cost / periods.total_revenue * 100) <= COALESCE(v_contract.cost_target_percent, 68)
        ELSE true 
      END,
      -- Análise de risco
      'risk_score', CASE
        -- Baixo risco: margem >= 30%
        WHEN periods.total_revenue > 0 AND ((periods.total_revenue - periods.total_cost) / periods.total_revenue * 100) >= 30 THEN 'low'
        -- Médio risco: margem entre 20% e 30%
        WHEN periods.total_revenue > 0 AND ((periods.total_revenue - periods.total_cost) / periods.total_revenue * 100) >= 20 THEN 'medium'
        -- Alto risco: margem < 20%
        ELSE 'high'
      END,
      -- Execução real (das medições vinculadas)
      'actual_revenue', periods.actual_revenue,
      'actual_cost', periods.actual_cost,
      'actual_balance', periods.actual_balance,
      'execution_accuracy', CASE 
        WHEN periods.executed_periods > 0 AND periods.total_balance > 0
        THEN ROUND((1 - ABS(periods.actual_balance - (periods.total_balance * periods.executed_periods / NULLIF(periods.total_periods, 0))) / 
             (periods.total_balance * periods.executed_periods / NULLIF(periods.total_periods, 0))) * 100, 1)
        ELSE null 
      END
    ) as version_data
    FROM public.planning_versions pv
    LEFT JOIN LATERAL (
      SELECT
        COUNT(pp.id) as total_periods,
        COUNT(CASE WHEN pp.is_executed THEN 1 END) as executed_periods,
        COALESCE(SUM(pp.revenue_expected), 0) as total_revenue,
        COALESCE(SUM(pp.planned_cost_estimate), 0) as total_cost,
        COALESCE(SUM(pp.financial_balance_estimate), 0) as total_balance,
        MIN(pp.start_date) as first_period_start,
        MAX(pp.end_date) as last_period_end,
        MAX(pp.end_date) - MIN(pp.start_date) as duration_days,
        -- Realizado
        COALESCE(SUM(CASE WHEN m.id IS NOT NULL THEN m.revenue_expected ELSE 0 END), 0) as actual_revenue,
        COALESCE(SUM(CASE WHEN m.id IS NOT NULL THEN m.realized_cost ELSE 0 END), 0) as actual_cost,
        COALESCE(SUM(CASE WHEN m.id IS NOT NULL THEN m.financial_result ELSE 0 END), 0) as actual_balance
      FROM public.planning_periods pp
      LEFT JOIN public.measurements m ON m.planning_period_id = pp.id
      WHERE pp.planning_version_id = pv.id
    ) periods ON true
    WHERE pv.project_id = p_project_id
  ) sub;
  
  RETURN jsonb_build_object(
    'success', true,
    'project', jsonb_build_object(
      'id', v_project.id,
      'name', v_project.name,
      'total_houses', v_project.total_houses,
      'start_date', v_project.start_date,
      'expected_end_date', v_project.expected_end_date
    ),
    'contract', jsonb_build_object(
      'value_total', COALESCE(v_contract.contract_value_total, 0),
      'cost_target_percent', COALESCE(v_contract.cost_target_percent, 68)
    ),
    'versions', v_versions_comparison,
    'recommendation', (
      SELECT jsonb_build_object(
        'best_margin_version', (
          SELECT pv.name 
          FROM public.planning_versions pv
          JOIN public.planning_periods pp ON pp.planning_version_id = pv.id
          WHERE pv.project_id = p_project_id
          GROUP BY pv.id, pv.name
          ORDER BY SUM(pp.financial_balance_estimate) DESC
          LIMIT 1
        ),
        'fastest_version', (
          SELECT pv.name 
          FROM public.planning_versions pv
          JOIN public.planning_periods pp ON pp.planning_version_id = pv.id
          WHERE pv.project_id = p_project_id
          GROUP BY pv.id, pv.name
          ORDER BY MAX(pp.end_date) - MIN(pp.start_date) ASC
          LIMIT 1
        ),
        'lowest_cost_version', (
          SELECT pv.name 
          FROM public.planning_versions pv
          JOIN public.planning_periods pp ON pp.planning_version_id = pv.id
          WHERE pv.project_id = p_project_id
          GROUP BY pv.id, pv.name
          ORDER BY SUM(pp.planned_cost_estimate) ASC
          LIMIT 1
        )
      )
    )
  );
END;
$$;

-- Comentários
COMMENT ON FUNCTION public.get_project_execution_dashboard IS 'Dashboard executivo: progresso geral, receita/custo/saldo, status dos períodos';
COMMENT ON FUNCTION public.get_measurement_dashboard IS 'Dashboard operacional: detalhes da medição, serviços críticos, produtividade';
COMMENT ON FUNCTION public.compare_planning_versions IS 'Compara cenários de planejamento: margem, prazo, custo, risco';