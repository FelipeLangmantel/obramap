
-- RPC: Adicionar período ao planejamento de longo prazo
CREATE OR REPLACE FUNCTION add_planning_period(
  p_project_id uuid,
  p_company_id uuid,
  p_planning_version_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_period_id uuid;
  v_last_period_number integer;
  v_last_end_date date;
  v_last_period_id uuid;
BEGIN
  -- Buscar último período
  SELECT 
    COALESCE(MAX(period_number), 0),
    COALESCE(MAX(end_date::date), CURRENT_DATE)
  INTO v_last_period_number, v_last_end_date
  FROM planning_periods
  WHERE planning_version_id = p_planning_version_id;

  -- Buscar ID do último período para copiar serviços
  SELECT id INTO v_last_period_id
  FROM planning_periods
  WHERE planning_version_id = p_planning_version_id
  ORDER BY period_number DESC
  LIMIT 1;

  -- Criar novo período
  INSERT INTO planning_periods (
    company_id, project_id, planning_version_id,
    period_number, start_date, end_date, status
  )
  VALUES (
    p_company_id,
    p_project_id,
    p_planning_version_id,
    v_last_period_number + 1,
    (v_last_end_date + 1)::text,
    (v_last_end_date + 30)::text,
    'draft'
  )
  RETURNING id INTO v_new_period_id;

  -- Copiar serviços do último período (com target_houses = 0)
  IF v_last_period_id IS NOT NULL THEN
    INSERT INTO service_planning_by_period (
      company_id, project_id, contract_id, planning_period_id,
      macro_id, scope_id, macro_name, scope_name,
      unit_cost_value, unit_revenue_value, target_houses,
      planned_cost, planned_revenue, projected_result, status
    )
    SELECT
      company_id, project_id, contract_id, v_new_period_id,
      macro_id, scope_id, macro_name, scope_name,
      unit_cost_value, unit_revenue_value, 0, 0, 0, 0, 'draft'
    FROM service_planning_by_period
    WHERE planning_period_id = v_last_period_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'period_id', v_new_period_id,
    'period_number', v_last_period_number + 1
  );
END;
$$;

-- RPC: Excluir período do planejamento de longo prazo
CREATE OR REPLACE FUNCTION delete_planning_period(
  p_period_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version_id uuid;
  v_period_count integer;
BEGIN
  -- Buscar versão do período
  SELECT planning_version_id INTO v_version_id
  FROM planning_periods
  WHERE id = p_period_id;

  IF v_version_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'period_not_found');
  END IF;

  -- Verificar quantos períodos existem
  SELECT COUNT(*) INTO v_period_count
  FROM planning_periods
  WHERE planning_version_id = v_version_id;

  -- Não permitir excluir se for o único período
  IF v_period_count <= 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'cannot_delete_last_period'
    );
  END IF;

  -- Deletar serviços do período
  DELETE FROM service_planning_by_period
  WHERE planning_period_id = p_period_id;

  -- Deletar período
  DELETE FROM planning_periods
  WHERE id = p_period_id;

  -- Renumerar períodos restantes
  WITH numbered AS (
    SELECT 
      id,
      ROW_NUMBER() OVER (ORDER BY start_date) as new_number
    FROM planning_periods
    WHERE planning_version_id = v_version_id
  )
  UPDATE planning_periods p
  SET period_number = n.new_number
  FROM numbered n
  WHERE p.id = n.id;

  RETURN jsonb_build_object('success', true);
END;
$$;
