-- =====================================================
-- 1. EXTEND supply_alerts with planning and budget fields
-- =====================================================
ALTER TABLE public.supply_alerts 
ADD COLUMN IF NOT EXISTS planned_use_date date,
ADD COLUMN IF NOT EXISTS actual_delivery_date date,
ADD COLUMN IF NOT EXISTS delay_days integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_critical boolean DEFAULT false;

-- =====================================================
-- 2. ADD status column to measurements for tracking execution
-- =====================================================
ALTER TABLE public.measurements 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'executed', 'closed'));

-- =====================================================
-- 3. CREATE FUNCTION: Validate measurement overlap (BLOCK duplicates)
-- =====================================================
CREATE OR REPLACE FUNCTION public.validate_measurement_no_overlap()
RETURNS TRIGGER AS $$
DECLARE
  v_overlap_count integer;
  v_house_overlap integer[];
BEGIN
  -- Check for overlapping date periods in the same project
  SELECT COUNT(*) INTO v_overlap_count
  FROM measurements m
  WHERE m.project_id = NEW.project_id
    AND m.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      (NEW.start_date BETWEEN m.start_date AND m.end_date)
      OR (NEW.end_date BETWEEN m.start_date AND m.end_date)
      OR (m.start_date BETWEEN NEW.start_date AND NEW.end_date)
    );

  IF v_overlap_count > 0 THEN
    RAISE EXCEPTION 'Measurement period overlaps with existing measurement. Period: % to %', NEW.start_date, NEW.end_date;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trigger_validate_measurement_overlap ON public.measurements;
CREATE TRIGGER trigger_validate_measurement_overlap
  BEFORE INSERT OR UPDATE ON public.measurements
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_measurement_no_overlap();

-- =====================================================
-- 4. CREATE FUNCTION: Validate no duplicate houses across measurements
-- =====================================================
CREATE OR REPLACE FUNCTION public.validate_measurement_service_houses()
RETURNS TRIGGER AS $$
DECLARE
  v_measurement_project_id uuid;
  v_house_id integer;
  v_existing record;
BEGIN
  -- Get the project_id from the measurement
  SELECT project_id INTO v_measurement_project_id
  FROM measurements
  WHERE id = NEW.measurement_id;

  -- Check each planned house for duplicates
  FOREACH v_house_id IN ARRAY NEW.planned_house_ids LOOP
    -- Check if this house is already planned in another measurement_service for the same scope
    SELECT ms.id, m.measurement_number INTO v_existing
    FROM measurement_services ms
    JOIN measurements m ON m.id = ms.measurement_id
    WHERE m.project_id = v_measurement_project_id
      AND ms.scope_id = NEW.scope_id
      AND ms.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND v_house_id = ANY(ms.planned_house_ids)
    LIMIT 1;
    
    IF v_existing.id IS NOT NULL THEN
      RAISE EXCEPTION 'House % is already planned in measurement %. Cannot duplicate planning.', 
        v_house_id, v_existing.measurement_number;
    END IF;

    -- Check if this house was already executed (has production record)
    IF EXISTS (
      SELECT 1 FROM productions p
      WHERE p.project_id = v_measurement_project_id
        AND p.scope_id = NEW.scope_id
        AND v_house_id = ANY(p.house_ids)
        AND NOT p.is_initial_database
    ) THEN
      RAISE EXCEPTION 'House % already has production records for scope %. Cannot re-plan executed house.', 
        v_house_id, NEW.scope_name;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trigger_validate_measurement_service_houses ON public.measurement_services;
CREATE TRIGGER trigger_validate_measurement_service_houses
  BEFORE INSERT OR UPDATE ON public.measurement_services
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_measurement_service_houses();

-- =====================================================
-- 5. CREATE FUNCTION: Mark measurement as executed when production is registered
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_measurement_status_on_production()
RETURNS TRIGGER AS $$
BEGIN
  -- If production is linked to a measurement, update its status
  IF NEW.measurement_id IS NOT NULL THEN
    UPDATE measurements
    SET status = 'executed', updated_at = now()
    WHERE id = NEW.measurement_id
      AND status != 'executed';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trigger_update_measurement_on_production ON public.productions;
CREATE TRIGGER trigger_update_measurement_on_production
  AFTER INSERT ON public.productions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_measurement_status_on_production();

-- =====================================================
-- 6. ENHANCED: regenerate_supply_alerts with full budget integration
-- =====================================================
DROP FUNCTION IF EXISTS public.regenerate_supply_alerts(uuid);

CREATE OR REPLACE FUNCTION public.regenerate_supply_alerts(p_project_id uuid)
RETURNS void AS $$
DECLARE
  v_planning record;
  v_scope_item record;
  v_family_id uuid;
  v_lead_time integer;
  v_order_by_date date;
  v_required_date date;
  v_is_critical boolean;
BEGIN
  -- Delete existing pending/delayed alerts for regeneration
  DELETE FROM supply_alerts 
  WHERE project_id = p_project_id 
    AND status IN ('pending', 'delayed');

  -- Loop through all future planned productions
  FOR v_planning IN (
    SELECT 
      pp.id as planning_id,
      pp.project_id,
      pp.scope_id,
      pp.scope_name,
      pp.macro_id,
      pp.macro_name,
      pp.planned_houses,
      pp.planned_house_ids,
      pp.week_start,
      pp.week_end,
      pp.measurement_number
    FROM planned_productions pp
    WHERE pp.project_id = p_project_id
      AND pp.week_start >= CURRENT_DATE
    ORDER BY pp.week_start
  ) LOOP
    -- For each scope_item (budget item) linked to this scope/macro
    FOR v_scope_item IN (
      SELECT 
        si.id as scope_item_id,
        si.name,
        si.category,
        si.quantity as qty_per_house,
        si.unit,
        si.unit_value,
        si.material_family,
        i.material_family_id,
        mf.id as family_id,
        mf.name as family_name,
        mf.is_labor,
        mf.lead_time_days as default_lead_time
      FROM scope_items si
      LEFT JOIN inputs i ON i.name = si.name AND i.project_id = p_project_id
      LEFT JOIN material_families mf ON mf.id = i.material_family_id
      WHERE si.project_id = p_project_id
        AND si.scope_id = v_planning.scope_id
        AND si.macro_id = v_planning.macro_id
    ) LOOP
      -- Get effective lead time (project override or default)
      v_family_id := v_scope_item.family_id;
      
      SELECT COALESCE(plt.lead_time_days, v_scope_item.default_lead_time, 7)
      INTO v_lead_time
      FROM (SELECT 1) dummy
      LEFT JOIN project_lead_times plt ON plt.project_id = p_project_id AND plt.family_id = v_family_id;
      
      v_required_date := v_planning.week_start::date;
      v_order_by_date := v_required_date - v_lead_time;
      v_is_critical := (v_order_by_date <= CURRENT_DATE + 3);

      -- Insert alert
      INSERT INTO supply_alerts (
        project_id,
        family_id,
        scope_id,
        macro_id,
        scope_item_id,
        is_labor,
        week_start,
        week_end,
        required_date,
        order_by_date,
        planned_use_date,
        total_quantity,
        total_value,
        status,
        is_critical,
        notes
      ) VALUES (
        p_project_id,
        v_family_id,
        v_planning.scope_id,
        v_planning.macro_id,
        v_scope_item.scope_item_id,
        COALESCE(v_scope_item.is_labor, v_scope_item.category = 'labor'),
        v_planning.week_start,
        v_planning.week_end,
        v_required_date,
        v_order_by_date,
        v_required_date,
        v_planning.planned_houses * COALESCE(v_scope_item.qty_per_house, 1),
        v_planning.planned_houses * COALESCE(v_scope_item.qty_per_house, 1) * COALESCE(v_scope_item.unit_value, 0),
        CASE 
          WHEN v_order_by_date < CURRENT_DATE THEN 'delayed'
          ELSE 'pending'
        END,
        v_is_critical,
        'Gerado para período ' || v_planning.week_start || ' - ' || v_planning.week_end || 
        ' (' || v_planning.planned_houses || ' casas)'
      );
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =====================================================
-- 7. CREATE FUNCTION: Calculate supply KPIs (backend-driven)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_supply_kpis(p_project_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
  v_delayed_orders integer;
  v_on_time_delivered integer;
  v_late_delivered integer;
  v_critical_purchases integer;
  v_planned_without_order integer;
  v_avg_delay_days numeric;
  v_production_stopped integer;
BEGIN
  -- Delayed orders: expected_delivery_date < today AND status not delivered
  SELECT COUNT(*) INTO v_delayed_orders
  FROM purchase_orders
  WHERE project_id = p_project_id
    AND expected_delivery_date < CURRENT_DATE
    AND status NOT IN ('delivered', 'cancelled');

  -- On-time delivered: actual_delivery_date <= expected_delivery_date
  SELECT COUNT(*) INTO v_on_time_delivered
  FROM purchase_orders
  WHERE project_id = p_project_id
    AND status = 'delivered'
    AND actual_delivery_date IS NOT NULL
    AND expected_delivery_date IS NOT NULL
    AND actual_delivery_date <= expected_delivery_date;

  -- Late delivered: actual_delivery_date > expected_delivery_date
  SELECT COUNT(*) INTO v_late_delivered
  FROM purchase_orders
  WHERE project_id = p_project_id
    AND status = 'delivered'
    AND actual_delivery_date IS NOT NULL
    AND expected_delivery_date IS NOT NULL
    AND actual_delivery_date > expected_delivery_date;

  -- Critical purchases: is_critical = true AND status = pending
  SELECT COUNT(*) INTO v_critical_purchases
  FROM supply_alerts
  WHERE project_id = p_project_id
    AND is_critical = true
    AND status IN ('pending', 'delayed');

  -- Planned without purchase order: pending alerts
  SELECT COUNT(*) INTO v_planned_without_order
  FROM supply_alerts
  WHERE project_id = p_project_id
    AND status IN ('pending', 'delayed')
    AND is_labor = false;

  -- Average delay days for late deliveries
  SELECT COALESCE(AVG(actual_delivery_date - expected_delivery_date), 0)
  INTO v_avg_delay_days
  FROM purchase_orders
  WHERE project_id = p_project_id
    AND status = 'delivered'
    AND actual_delivery_date > expected_delivery_date;

  -- Production potentially stopped: delayed alerts where planned_use_date < today
  SELECT COUNT(*) INTO v_production_stopped
  FROM supply_alerts
  WHERE project_id = p_project_id
    AND status = 'delayed'
    AND planned_use_date <= CURRENT_DATE;

  v_result := jsonb_build_object(
    'delayed_orders', v_delayed_orders,
    'on_time_delivered', v_on_time_delivered,
    'late_delivered', v_late_delivered,
    'critical_purchases', v_critical_purchases,
    'planned_without_order', v_planned_without_order,
    'avg_delay_days', ROUND(v_avg_delay_days::numeric, 1),
    'production_stopped', v_production_stopped,
    'total_pending_value', (
      SELECT COALESCE(SUM(total_value), 0) 
      FROM supply_alerts 
      WHERE project_id = p_project_id AND status IN ('pending', 'delayed')
    ),
    'next_order_date', (
      SELECT MIN(order_by_date) 
      FROM supply_alerts 
      WHERE project_id = p_project_id AND status = 'pending'
    )
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =====================================================
-- 8. CREATE TRIGGER: Auto-regenerate alerts on planning changes
-- =====================================================
CREATE OR REPLACE FUNCTION public.trigger_regenerate_alerts_on_planning()
RETURNS TRIGGER AS $$
BEGIN
  -- Regenerate alerts for the affected project
  PERFORM regenerate_supply_alerts(COALESCE(NEW.project_id, OLD.project_id));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trigger_regen_alerts_planned_productions ON public.planned_productions;
CREATE TRIGGER trigger_regen_alerts_planned_productions
  AFTER INSERT OR UPDATE OR DELETE ON public.planned_productions
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_regenerate_alerts_on_planning();

-- =====================================================
-- 9. CREATE TRIGGER: Auto-regenerate alerts on lead time changes
-- =====================================================
CREATE OR REPLACE FUNCTION public.trigger_regenerate_alerts_on_leadtime()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM regenerate_supply_alerts(COALESCE(NEW.project_id, OLD.project_id));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trigger_regen_alerts_project_lead_times ON public.project_lead_times;
CREATE TRIGGER trigger_regen_alerts_project_lead_times
  AFTER INSERT OR UPDATE OR DELETE ON public.project_lead_times
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_regenerate_alerts_on_leadtime();

-- =====================================================
-- 10. CREATE TRIGGER: Update alert status when purchase order changes
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_supply_alert_from_order()
RETURNS TRIGGER AS $$
BEGIN
  -- When a purchase order is delivered, update related alerts
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
    UPDATE supply_alerts sa
    SET 
      status = 'delivered',
      actual_delivery_date = COALESCE(NEW.actual_delivery_date, CURRENT_DATE),
      delay_days = CASE 
        WHEN NEW.actual_delivery_date > NEW.expected_delivery_date 
        THEN NEW.actual_delivery_date - NEW.expected_delivery_date 
        ELSE 0 
      END,
      updated_at = now()
    FROM purchase_order_items poi
    JOIN scope_items si ON si.name = poi.name AND si.project_id = NEW.project_id
    WHERE sa.scope_item_id = si.id
      AND sa.project_id = NEW.project_id
      AND sa.status IN ('ordered', 'in_transit');
  END IF;

  -- When order is created/sent, mark alerts as ordered
  IF NEW.status IN ('sent', 'confirmed') AND OLD.status = 'pending' THEN
    UPDATE supply_alerts sa
    SET status = 'ordered', updated_at = now()
    FROM purchase_order_items poi
    JOIN scope_items si ON si.name = poi.name AND si.project_id = NEW.project_id
    WHERE sa.scope_item_id = si.id
      AND sa.project_id = NEW.project_id
      AND sa.status IN ('pending', 'quoted', 'approved');
  END IF;

  -- Mark as in_transit
  IF NEW.status = 'in_transit' AND OLD.status != 'in_transit' THEN
    UPDATE supply_alerts sa
    SET status = 'in_transit', updated_at = now()
    FROM purchase_order_items poi
    JOIN scope_items si ON si.name = poi.name AND si.project_id = NEW.project_id
    WHERE sa.scope_item_id = si.id
      AND sa.project_id = NEW.project_id
      AND sa.status = 'ordered';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trigger_update_alert_from_order ON public.purchase_orders;
CREATE TRIGGER trigger_update_alert_from_order
  AFTER UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_supply_alert_from_order();

-- =====================================================
-- 11. CREATE FUNCTION: Get available measurements for planning (excludes executed)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_available_measurements(p_project_id uuid)
RETURNS TABLE (
  id uuid,
  measurement_number integer,
  start_date date,
  end_date date,
  status text,
  notes text
) AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.measurement_number, m.start_date, m.end_date, m.status, m.notes
  FROM measurements m
  WHERE m.project_id = p_project_id
    AND m.status NOT IN ('executed', 'closed')
  ORDER BY m.measurement_number;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =====================================================
-- 12. CREATE FUNCTION: Close measurement and create production records
-- =====================================================
CREATE OR REPLACE FUNCTION public.close_labor_measurement(
  p_contract_id uuid,
  p_house_ids integer[],
  p_notes text DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_contract record;
BEGIN
  -- Get contract details
  SELECT * INTO v_contract
  FROM labor_contracts
  WHERE id = p_contract_id;

  IF v_contract IS NULL THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  -- Create production record
  INSERT INTO productions (
    project_id,
    scope_id,
    scope_name,
    macro_id,
    macro_name,
    macro_color,
    house_ids,
    houses_count,
    production_date,
    notes,
    is_unplanned,
    is_initial_database
  ) VALUES (
    v_contract.project_id,
    v_contract.scope_id,
    v_contract.scope_name,
    v_contract.macro_id,
    v_contract.macro_name,
    '#9ca3af',
    p_house_ids,
    array_length(p_house_ids, 1),
    CURRENT_DATE,
    COALESCE(p_notes, 'Gerado por fechamento de medição'),
    false,
    false
  );

  -- Update contract executed houses
  UPDATE labor_contracts
  SET 
    executed_houses = executed_houses + array_length(p_house_ids, 1),
    status = CASE 
      WHEN executed_houses + array_length(p_house_ids, 1) >= contracted_houses THEN 'completed'
      ELSE 'in_progress'
    END,
    updated_at = now()
  WHERE id = p_contract_id;

  -- Update related supply alerts
  UPDATE supply_alerts
  SET status = 'delivered', updated_at = now()
  WHERE project_id = v_contract.project_id
    AND scope_id = v_contract.scope_id
    AND is_labor = true
    AND status IN ('contracted', 'pending');
END;
$$ LANGUAGE plpgsql SET search_path = public;