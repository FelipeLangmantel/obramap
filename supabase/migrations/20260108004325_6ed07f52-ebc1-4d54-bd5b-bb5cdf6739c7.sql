-- Extend supply_alerts to link with budget/services
ALTER TABLE public.supply_alerts
ADD COLUMN IF NOT EXISTS scope_id TEXT,
ADD COLUMN IF NOT EXISTS macro_id TEXT,
ADD COLUMN IF NOT EXISTS scope_item_id UUID REFERENCES public.scope_items(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS is_labor BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS week_start DATE,
ADD COLUMN IF NOT EXISTS week_end DATE;

-- Drop old RPC and create new one using budget as source
DROP FUNCTION IF EXISTS public.regenerate_supply_alerts(uuid);

CREATE OR REPLACE FUNCTION public.regenerate_supply_alerts(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_production RECORD;
  v_scope_item RECORD;
  v_lead_time INTEGER;
  v_order_by_date DATE;
  v_required_date DATE;
  v_total_qty NUMERIC;
  v_total_value NUMERIC;
  v_family_id UUID;
  v_is_labor BOOLEAN;
BEGIN
  -- Delete existing pending alerts for this project (keep historical)
  DELETE FROM supply_alerts 
  WHERE project_id = p_project_id 
  AND status = 'pending';

  -- Loop through planned productions
  FOR v_production IN 
    SELECT 
      pp.id,
      pp.scope_id,
      pp.macro_id,
      pp.macro_name,
      pp.scope_name,
      pp.planned_houses,
      pp.planned_house_ids,
      pp.week_start,
      pp.week_end,
      pp.measurement_number
    FROM planned_productions pp
    WHERE pp.project_id = p_project_id
    AND pp.week_start >= CURRENT_DATE
  LOOP
    -- Get scope items (budget) for this service
    FOR v_scope_item IN
      SELECT 
        si.id,
        si.name,
        si.category,
        si.quantity as qty_per_house,
        si.unit_value,
        si.material_family,
        i.material_family_id,
        COALESCE(si.category = 'labor', false) as is_labor
      FROM scope_items si
      LEFT JOIN inputs i ON i.id = si.input_id
      WHERE si.project_id = p_project_id
      AND si.scope_id = v_production.scope_id
      AND si.macro_id = v_production.macro_id
    LOOP
      -- Determine family_id
      IF v_scope_item.material_family_id IS NOT NULL THEN
        v_family_id := v_scope_item.material_family_id;
      ELSE
        -- Try to find/create family by name
        SELECT id INTO v_family_id
        FROM material_families
        WHERE name = COALESCE(v_scope_item.material_family, 
          CASE WHEN v_scope_item.is_labor THEN 'Mão de Obra' ELSE 'Outros' END)
        AND project_id = p_project_id
        LIMIT 1;
      END IF;

      v_is_labor := v_scope_item.is_labor;

      -- Calculate total quantity and value
      v_total_qty := v_scope_item.qty_per_house * v_production.planned_houses;
      v_total_value := v_total_qty * COALESCE(v_scope_item.unit_value, 0);

      -- Get lead time (project-specific or family default)
      SELECT COALESCE(plt.lead_time_days, mf.lead_time_days, 7)
      INTO v_lead_time
      FROM material_families mf
      LEFT JOIN project_lead_times plt ON plt.family_id = mf.id AND plt.project_id = p_project_id
      WHERE mf.id = v_family_id;

      v_lead_time := COALESCE(v_lead_time, 7);

      -- Calculate dates
      v_required_date := v_production.week_start::date;
      v_order_by_date := v_required_date - v_lead_time;

      -- Skip if order date is in the past (already missed)
      IF v_order_by_date < CURRENT_DATE THEN
        v_order_by_date := CURRENT_DATE;
      END IF;

      -- Insert or update alert (group by project + scope + family + week)
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
        total_quantity,
        total_value,
        status
      ) VALUES (
        p_project_id,
        v_family_id,
        v_production.scope_id,
        v_production.macro_id,
        v_scope_item.id,
        v_is_labor,
        v_production.week_start,
        v_production.week_end,
        v_required_date,
        v_order_by_date,
        v_total_qty,
        v_total_value,
        'pending'
      )
      ON CONFLICT (id) DO NOTHING;

    END LOOP;
  END LOOP;
END;
$$;