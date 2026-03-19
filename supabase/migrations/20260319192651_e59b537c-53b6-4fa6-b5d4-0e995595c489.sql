
-- 1. Update generate_supplies_from_planning_period to populate blocked_house_ids and blocked_scope_ids
CREATE OR REPLACE FUNCTION public.generate_supplies_from_planning_period(p_period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period RECORD;
  v_project_id uuid;
  v_start_date date;
  v_inserted_count integer := 0;
  v_deleted_count integer := 0;
BEGIN
  SELECT pp.id, pp.project_id, pp.start_date, pp.status
  INTO v_period
  FROM planning_periods pp
  WHERE pp.id = p_period_id;

  IF v_period IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'period_not_found', 'message', 'Período não encontrado');
  END IF;

  IF v_period.status NOT IN ('approved', 'released_to_weekly', 'closed') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_status',
      'message', 'Suprimentos só podem ser gerados para períodos aprovados/liberados/fechados'
    );
  END IF;

  v_project_id := v_period.project_id;
  v_start_date := v_period.start_date;

  DELETE FROM supply_requests
  WHERE planning_period_id = p_period_id
    AND status = 'alert';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  WITH planned_items AS (
    SELECT
      sp.id as service_plan_id,
      sp.project_id,
      sp.macro_id,
      sp.scope_id,
      sp.target_houses,
      sp.target_house_ids,
      si.input_id as item_id,
      si.name as item_name,
      si.unit as item_unit,
      si.unit_value,
      i.material_family_id as family_id,
      (si.quantity * sp.target_houses) as total_quantity
    FROM service_planning_by_period sp
    INNER JOIN scope_items si
      ON si.project_id = sp.project_id
      AND si.macro_id = sp.macro_id
      AND si.scope_id = sp.scope_id
      AND si.category IN ('material', 'labor')
    LEFT JOIN inputs i ON i.id = si.input_id
    WHERE sp.planning_period_id = p_period_id
      AND sp.target_houses > 0
  ),
  aggregated_items AS (
    SELECT
      service_plan_id,
      project_id,
      macro_id,
      scope_id,
      item_id,
      (array_agg(item_name))[1] as item_name,
      (array_agg(item_unit))[1] as item_unit,
      SUM(total_quantity) as total_quantity,
      CASE
        WHEN SUM(total_quantity) > 0
          THEN SUM(COALESCE(unit_value, 0) * total_quantity) / SUM(total_quantity)
        ELSE 0
      END as unit_value,
      (array_agg(family_id) FILTER (WHERE family_id IS NOT NULL))[1] as family_id,
      -- Collect house_ids and scope_ids for impact tracking
      (array_agg(DISTINCT target_house_ids))[1] as blocked_house_ids_raw,
      array_agg(DISTINCT scope_id) as blocked_scope_ids_raw
    FROM planned_items
    WHERE total_quantity > 0
      AND item_id IS NOT NULL
    GROUP BY service_plan_id, project_id, macro_id, scope_id, item_id
  ),
  items_with_lead_time AS (
    SELECT
      ai.*,
      COALESCE(plt.lead_time_days, mf.lead_time_days, 7) as lead_time_days,
      v_start_date as required_date,
      (v_start_date - COALESCE(plt.lead_time_days, mf.lead_time_days, 7))::date as order_by_date
    FROM aggregated_items ai
    LEFT JOIN material_families mf ON mf.id = ai.family_id
    LEFT JOIN project_lead_times plt
      ON plt.family_id = ai.family_id
      AND plt.project_id = ai.project_id
  )
  INSERT INTO supply_requests (
    project_id,
    planning_period_id,
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
    measurement_id,
    status,
    lead_time_days,
    is_critical,
    blocked_house_ids,
    blocked_scope_ids,
    created_at,
    updated_at
  )
  SELECT
    v_project_id,
    p_period_id,
    iwlt.item_id,
    COALESCE(iwlt.item_name, 'Insumo sem nome'),
    iwlt.item_unit,
    iwlt.total_quantity,
    COALESCE(iwlt.unit_value, 0),
    iwlt.family_id,
    iwlt.scope_id,
    iwlt.macro_id,
    iwlt.required_date,
    iwlt.order_by_date,
    iwlt.service_plan_id,
    NULL,
    'alert'::supply_request_status,
    iwlt.lead_time_days,
    (iwlt.order_by_date <= CURRENT_DATE + 7),
    COALESCE(iwlt.blocked_house_ids_raw, '{}'),
    COALESCE(iwlt.blocked_scope_ids_raw, '{}'),
    now(),
    now()
  FROM items_with_lead_time iwlt
  WHERE NOT EXISTS (
    SELECT 1 FROM supply_requests sr
    WHERE sr.planning_period_id = p_period_id
      AND sr.source_plan_id = iwlt.service_plan_id
      AND sr.item_id = iwlt.item_id
      AND sr.status NOT IN ('alert', 'cancelled')
  );

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

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

-- 2. Create update_supply_impacts RPC
CREATE OR REPLACE FUNCTION public.update_supply_impacts(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  UPDATE supply_requests sr
  SET
    blocked_house_ids = COALESCE(impact.house_ids, '{}'),
    blocked_scope_ids = COALESCE(impact.scope_ids, '{}'),
    impact_description = 'Atraso de ' || sr.days_overdue || ' dias pode impactar ' 
      || COALESCE(array_length(impact.house_ids, 1), 0) || ' casas no serviço ' 
      || COALESCE(impact.scope_name, sr.item_name),
    updated_at = now()
  FROM (
    SELECT
      sr2.id as request_id,
      COALESCE(
        (SELECT array_agg(DISTINCT h_id) FROM (
          SELECT unnest(sp.target_house_ids) as h_id
          FROM service_planning_by_period sp
          WHERE sp.planning_period_id = sr2.planning_period_id
            AND sp.scope_id = sr2.scope_id
            AND sp.target_houses > 0
          UNION ALL
          SELECT unnest(wps.planned_house_ids) as h_id
          FROM weekly_plan_services wps
          INNER JOIN weekly_plan_weeks wpw ON wpw.id = wps.weekly_plan_week_id
          WHERE wpw.planning_period_id = sr2.planning_period_id
            AND wps.scope_id = sr2.scope_id
        ) sub),
        '{}'
      ) as house_ids,
      ARRAY[sr2.scope_id]::text[] as scope_ids,
      (SELECT s.name FROM scopes s WHERE s.id = sr2.scope_id LIMIT 1) as scope_name
    FROM supply_requests sr2
    WHERE sr2.project_id = p_project_id
      AND sr2.purchase_overdue = true
      AND sr2.status NOT IN ('ordered', 'delivered', 'cancelled')
  ) impact
  WHERE sr.id = impact.request_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated);
END;
$$;

-- 3. Trigger: auto-call update_supply_impacts when purchase_overdue flips to true
CREATE OR REPLACE FUNCTION public.trg_supply_overdue_impact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when purchase_overdue changes to true
  IF NEW.purchase_overdue = true AND (OLD.purchase_overdue IS DISTINCT FROM true) THEN
    PERFORM update_supply_impacts(NEW.project_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supply_overdue_impact ON public.supply_requests;
CREATE TRIGGER trg_supply_overdue_impact
  AFTER INSERT OR UPDATE OF purchase_overdue ON public.supply_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_supply_overdue_impact();
