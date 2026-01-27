-- ============================================================
-- RPC: generate_supplies_from_planning_period
-- Gera supply_requests a partir do Planejamento de Medições aprovado
-- Fonte: service_planning_by_period + scope_items (materials)
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_supplies_from_planning_period(
  p_period_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_period RECORD;
  v_project_id uuid;
  v_company_id uuid;
  v_start_date date;
  v_inserted_count integer := 0;
  v_deleted_count integer := 0;
BEGIN
  -- 1. Buscar período e validar status
  SELECT pp.id, pp.project_id, pp.company_id, pp.start_date, pp.status
  INTO v_period
  FROM planning_periods pp
  WHERE pp.id = p_period_id;

  IF v_period IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'period_not_found', 'message', 'Período não encontrado');
  END IF;

  IF v_period.status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status', 'message', 'Suprimentos só podem ser gerados para períodos aprovados');
  END IF;

  v_project_id := v_period.project_id;
  v_company_id := v_period.company_id;
  v_start_date := v_period.start_date;

  -- 2. Limpar suprimentos existentes deste período que estão em status 'alert' ou 'pending'
  DELETE FROM supply_requests
  WHERE source_plan_id IN (
    SELECT id FROM service_planning_by_period WHERE planning_period_id = p_period_id
  )
  AND status = 'alert';
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- 3. Gerar novos supply_requests a partir de scope_items (category = 'material')
  WITH planned_materials AS (
    SELECT
      sp.id as service_plan_id,
      sp.project_id,
      sp.macro_id,
      sp.scope_id,
      sp.target_houses,
      si.id as scope_item_id,
      si.input_id as item_id,
      si.name as item_name,
      si.unit as item_unit,
      si.quantity as quantity_per_house,
      si.unit_value,
      i.material_family_id as family_id,
      -- Calcular quantidade total: consumo_unitário × casas_planejadas
      (si.quantity * sp.target_houses) as total_quantity
    FROM service_planning_by_period sp
    INNER JOIN scope_items si 
      ON si.project_id = sp.project_id 
      AND si.macro_id = sp.macro_id 
      AND si.scope_id = sp.scope_id
      AND si.category = 'material'
    LEFT JOIN inputs i ON i.id = si.input_id
    WHERE sp.planning_period_id = p_period_id
      AND sp.target_houses > 0
  ),
  materials_with_lead_time AS (
    SELECT
      pm.*,
      -- Hierarquia de lead time: projeto > família > default (7 dias)
      COALESCE(plt.lead_time_days, mf.lead_time_days, 7) as lead_time_days,
      v_start_date as required_date,
      (v_start_date - COALESCE(plt.lead_time_days, mf.lead_time_days, 7))::date as order_by_date
    FROM planned_materials pm
    LEFT JOIN material_families mf ON mf.id = pm.family_id
    LEFT JOIN project_lead_times plt 
      ON plt.family_id = pm.family_id 
      AND plt.project_id = pm.project_id
    WHERE pm.total_quantity > 0
  )
  INSERT INTO supply_requests (
    project_id,
    item_id,
    item_name,
    item_unit,
    quantity,
    unit_value,
    family_id,
    scope_id,
    macro_id,
    required_date,
    order_by_date,
    source_plan_id,
    status,
    lead_time_days,
    is_critical,
    created_at,
    updated_at
  )
  SELECT
    v_project_id,
    mwlt.item_id,
    mwlt.item_name,
    mwlt.item_unit,
    mwlt.total_quantity,
    COALESCE(mwlt.unit_value, 0),
    mwlt.family_id,
    mwlt.scope_id,
    mwlt.macro_id,
    mwlt.required_date,
    mwlt.order_by_date,
    mwlt.service_plan_id,
    'alert'::supply_request_status,
    mwlt.lead_time_days,
    (mwlt.order_by_date <= CURRENT_DATE + 7), -- Crítico se prazo for em 7 dias
    now(),
    now()
  FROM materials_with_lead_time mwlt
  -- Evitar duplicatas: não inserir se já existe pedido não-cancelado para o mesmo item/serviço
  WHERE NOT EXISTS (
    SELECT 1 FROM supply_requests sr
    WHERE sr.source_plan_id = mwlt.service_plan_id
      AND sr.item_id = mwlt.item_id
      AND sr.status NOT IN ('alert', 'cancelled')
  );

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  -- 4. Atualizar flag de suprimentos no período (se houver campo)
  UPDATE planning_periods
  SET updated_at = now()
  WHERE id = p_period_id;

  RAISE NOTICE 'generate_supplies_from_planning_period: period=%, deleted=%, inserted=%', 
    p_period_id, v_deleted_count, v_inserted_count;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'inserted_count', v_inserted_count,
    'period_id', p_period_id
  );
END;
$$;

-- Adicionar coluna para rastrear se suprimentos foram gerados
ALTER TABLE planning_periods
ADD COLUMN IF NOT EXISTS supplies_generated_at timestamp with time zone;

-- Adicionar coluna lead_time_days em supply_requests se não existir
ALTER TABLE supply_requests
ADD COLUMN IF NOT EXISTS lead_time_days integer;

COMMENT ON FUNCTION public.generate_supplies_from_planning_period IS 
'Gera requisições de suprimentos (supply_requests) a partir do planejamento de medições aprovado. 
Fonte exclusiva: service_planning_by_period + scope_items (materiais).
Só executa se status = approved. Limpa apenas status alert antes de regenerar.';