-- Função para recalcular deadline e risco de suprimentos por serviço planejado
CREATE OR REPLACE FUNCTION public.recalculate_service_supply_deadline(
  p_service_planning_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planned_start date;
  v_max_lead_time integer;
  v_buffer integer := 2; -- buffer fixo de 2 dias
  v_supply_deadline date;
BEGIN
  -- Buscar a data de início planejada
  SELECT planned_start_date INTO v_planned_start
  FROM service_planning_by_period
  WHERE id = p_service_planning_id;

  IF v_planned_start IS NULL THEN
    RETURN;
  END IF;

  -- Buscar o maior lead_time dos insumos vinculados ao serviço (macro/scope)
  SELECT COALESCE(MAX(mf.lead_time_days), 7) INTO v_max_lead_time
  FROM service_planning_by_period sp
  JOIN budget_service_inputs bsi ON bsi.macro_id = sp.macro_id 
    AND bsi.scope_id = sp.scope_id
    AND bsi.project_id = sp.project_id
  JOIN inputs i ON i.id = bsi.input_id
  LEFT JOIN material_families mf ON mf.id = i.material_family_id
  WHERE sp.id = p_service_planning_id;

  -- Calcular deadline: planned_start - lead_time - buffer
  v_supply_deadline := v_planned_start - v_max_lead_time - v_buffer;

  -- Atualizar o registro com deadline e risco
  UPDATE service_planning_by_period
  SET 
    supply_deadline = v_supply_deadline,
    supply_risk = (CURRENT_DATE > v_supply_deadline),
    updated_at = now()
  WHERE id = p_service_planning_id;
END;
$$;

-- Função para recalcular todos os serviços de um período
CREATE OR REPLACE FUNCTION public.recalculate_period_supply_deadlines(
  p_planning_period_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM recalculate_service_supply_deadline(id)
  FROM service_planning_by_period
  WHERE planning_period_id = p_planning_period_id
    AND planned_start_date IS NOT NULL;
END;
$$;