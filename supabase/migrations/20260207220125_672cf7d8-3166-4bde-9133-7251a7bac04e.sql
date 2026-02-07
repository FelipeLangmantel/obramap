
-- 1. Adicionar coluna planning_period_id na tabela supply_requests
ALTER TABLE public.supply_requests 
ADD COLUMN IF NOT EXISTS planning_period_id uuid REFERENCES public.planning_periods(id);

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_supply_requests_planning_period_id 
ON public.supply_requests(planning_period_id);

-- 2. Backfill: preencher planning_period_id a partir de measurement_id existente
UPDATE public.supply_requests sr
SET planning_period_id = m.planning_period_id
FROM measurements m
WHERE sr.measurement_id = m.id
  AND sr.planning_period_id IS NULL
  AND m.planning_period_id IS NOT NULL;

-- Backfill via source_plan_id (service_planning_by_period)
UPDATE public.supply_requests sr
SET planning_period_id = sp.planning_period_id
FROM service_planning_by_period sp
WHERE sr.source_plan_id = sp.id
  AND sr.planning_period_id IS NULL;

-- ============================================================
-- 3. Reescrever generate_supplies_from_planning_period
--    Agora seta planning_period_id explicitamente
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_supplies_from_planning_period(p_period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- 2. Limpar suprimentos existentes deste período que estão em status 'alert'
  DELETE FROM supply_requests
  WHERE planning_period_id = p_period_id
    AND status = 'alert';
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- 3. Gerar supply_requests a partir de service_planning_by_period + scope_items (category = 'material')
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
    planning_period_id,
    item_id,
    item_name,
    item_unit,
    quantity,
    unit_value,
    total_value,
    family_id,
    scope_id,
    macro_id,
    required_date,
    order_by_date,
    source_plan_id,
    measurement_id,
    status,
    lead_time_days,
    is_critical,
    created_at,
    updated_at
  )
  SELECT
    v_project_id,
    p_period_id,
    mwlt.item_id,
    mwlt.item_name,
    mwlt.item_unit,
    mwlt.total_quantity,
    COALESCE(mwlt.unit_value, 0),
    COALESCE(mwlt.unit_value, 0) * mwlt.total_quantity,
    mwlt.family_id,
    mwlt.scope_id,
    mwlt.macro_id,
    mwlt.required_date,
    mwlt.order_by_date,
    mwlt.service_plan_id,
    NULL,  -- measurement_id = NULL (será vinculado depois pelo planejamento semanal)
    'alert'::supply_request_status,
    mwlt.lead_time_days,
    (mwlt.order_by_date <= CURRENT_DATE + 7),
    now(),
    now()
  FROM materials_with_lead_time mwlt
  WHERE NOT EXISTS (
    SELECT 1 FROM supply_requests sr
    WHERE sr.planning_period_id = p_period_id
      AND sr.source_plan_id = mwlt.service_plan_id
      AND sr.item_id = mwlt.item_id
      AND sr.status NOT IN ('alert', 'cancelled')
  );

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  -- 4. Atualizar timestamp de suprimentos gerados
  UPDATE planning_periods
  SET supplies_generated_at = now(), updated_at = now()
  WHERE id = p_period_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'inserted_count', v_inserted_count,
    'period_id', p_period_id
  );
END;
$function$;

-- ============================================================
-- 4. Reescrever get_supply_requests_by_measurement → agrupar por planning_periods
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_supply_requests_by_measurement(p_project_id uuid)
RETURNS TABLE(
  measurement_id uuid,
  measurement_number integer,
  start_date date,
  end_date date,
  measurement_status text,
  total_items bigint,
  total_quantity numeric,
  total_value numeric,
  items_alert bigint,
  items_quoted bigint,
  items_ordered bigint,
  items_delivered bigint,
  percent_purchased numeric,
  supply_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    pp.id AS measurement_id,  -- Manter nome do campo para compatibilidade frontend
    pp.period_number AS measurement_number,
    pp.start_date,
    pp.end_date,
    pp.status AS measurement_status,
    COUNT(sr.id) AS total_items,
    COALESCE(SUM(sr.quantity), 0) AS total_quantity,
    COALESCE(SUM(sr.total_value), 0) AS total_value,
    COUNT(sr.id) FILTER (WHERE sr.status = 'alert') AS items_alert,
    COUNT(sr.id) FILTER (WHERE sr.status = 'quoted') AS items_quoted,
    COUNT(sr.id) FILTER (WHERE sr.status = 'ordered') AS items_ordered,
    COUNT(sr.id) FILTER (WHERE sr.status = 'delivered') AS items_delivered,
    CASE 
      WHEN COUNT(sr.id) = 0 THEN 0::numeric
      ELSE ROUND(
        (COUNT(sr.id) FILTER (WHERE sr.status IN ('ordered', 'delivered'))::numeric / COUNT(sr.id)::numeric) * 100, 
        1
      )
    END AS percent_purchased,
    CASE
      WHEN COUNT(sr.id) = 0 THEN 'empty'
      WHEN COUNT(sr.id) = COUNT(sr.id) FILTER (WHERE sr.status = 'delivered') THEN 'complete'
      WHEN COUNT(sr.id) FILTER (WHERE sr.status IN ('ordered', 'delivered')) > 0 THEN 'partial'
      WHEN COUNT(sr.id) FILTER (WHERE sr.status = 'quoted') > 0 THEN 'quoted'
      ELSE 'pending'
    END AS supply_status
  FROM planning_periods pp
  LEFT JOIN supply_requests sr 
    ON sr.planning_period_id = pp.id 
    AND sr.status != 'cancelled'
  WHERE pp.project_id = p_project_id
    AND pp.planning_version_id = (
      SELECT pv.id FROM planning_versions pv 
      WHERE pv.project_id = p_project_id AND pv.is_active = true
      LIMIT 1
    )
  GROUP BY pp.id, pp.period_number, pp.start_date, pp.end_date, pp.status
  ORDER BY pp.period_number ASC;
END;
$function$;

-- ============================================================
-- 5. Reescrever get_measurement_supply_requests → filtrar por planning_period_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_measurement_supply_requests(
  p_project_id uuid, 
  p_measurement_id uuid,  -- Na verdade é planning_period_id (compatibilidade)
  p_status text DEFAULT NULL
)
RETURNS TABLE(
  id uuid, project_id uuid, item_id uuid, item_name text, item_unit text,
  quantity numeric, unit_value numeric, total_value numeric, status text,
  source_plan_id uuid, measurement_id uuid, family_id uuid, family_name text,
  family_color text, scope_id text, macro_id text, required_date date,
  order_by_date date, is_critical boolean, notes text, quotation_id uuid,
  purchase_order_id uuid, supplier_id uuid, supplier_name text,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    sr.id,
    sr.project_id,
    sr.item_id,
    sr.item_name,
    sr.item_unit,
    sr.quantity,
    sr.unit_value,
    sr.total_value,
    sr.status::text,
    sr.source_plan_id,
    sr.measurement_id,
    sr.family_id,
    mf.name AS family_name,
    mf.color AS family_color,
    sr.scope_id,
    sr.macro_id,
    sr.required_date,
    sr.order_by_date,
    sr.is_critical,
    sr.notes,
    sr.quotation_id,
    sr.purchase_order_id,
    sr.supplier_id,
    s.name AS supplier_name,
    sr.created_at,
    sr.updated_at
  FROM supply_requests sr
  LEFT JOIN material_families mf ON sr.family_id = mf.id
  LEFT JOIN suppliers s ON sr.supplier_id = s.id
  WHERE sr.project_id = p_project_id
    AND sr.planning_period_id = p_measurement_id  -- Filtra por planning_period_id
    AND (p_status IS NULL OR sr.status::text = p_status)
    AND sr.status != 'cancelled'
  ORDER BY sr.is_critical DESC, sr.order_by_date ASC;
END;
$function$;

-- ============================================================
-- 6. Reescrever get_measurement_supply_kpis → filtrar por planning_period_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_measurement_supply_kpis(
  p_project_id uuid, 
  p_measurement_id uuid  -- Na verdade é planning_period_id (compatibilidade)
)
RETURNS TABLE(
  total_items bigint, total_quantity numeric, total_value numeric,
  items_alert bigint, items_quoted bigint, items_ordered bigint,
  items_delivered bigint, critical_items bigint, percent_purchased numeric,
  value_purchased numeric, value_pending numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(sr.id) AS total_items,
    COALESCE(SUM(sr.quantity), 0) AS total_quantity,
    COALESCE(SUM(sr.total_value), 0) AS total_value,
    COUNT(sr.id) FILTER (WHERE sr.status = 'alert') AS items_alert,
    COUNT(sr.id) FILTER (WHERE sr.status = 'quoted') AS items_quoted,
    COUNT(sr.id) FILTER (WHERE sr.status = 'ordered') AS items_ordered,
    COUNT(sr.id) FILTER (WHERE sr.status = 'delivered') AS items_delivered,
    COUNT(sr.id) FILTER (WHERE sr.is_critical = true AND sr.status NOT IN ('delivered', 'cancelled')) AS critical_items,
    CASE 
      WHEN COUNT(sr.id) = 0 THEN 0::numeric
      ELSE ROUND(
        (COUNT(sr.id) FILTER (WHERE sr.status IN ('ordered', 'delivered'))::numeric / COUNT(sr.id)::numeric) * 100, 
        1
      )
    END AS percent_purchased,
    COALESCE(SUM(sr.total_value) FILTER (WHERE sr.status IN ('ordered', 'delivered')), 0) AS value_purchased,
    COALESCE(SUM(sr.total_value) FILTER (WHERE sr.status IN ('alert', 'quoted')), 0) AS value_pending
  FROM supply_requests sr
  WHERE sr.project_id = p_project_id
    AND sr.planning_period_id = p_measurement_id  -- Filtra por planning_period_id
    AND sr.status != 'cancelled';
END;
$function$;
