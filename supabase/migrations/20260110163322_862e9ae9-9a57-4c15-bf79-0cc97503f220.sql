-- ============================================================
-- FASE 14.4 — DEADLINE E RISCO POR INSUMO DO PERÍODO
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalculate_period_item_supply_risk(
  p_planning_period_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buffer integer := 2;
BEGIN
  UPDATE period_supply_requirements psr
  SET
    lead_time_days = COALESCE(mf.lead_time_days, 7),
    purchase_deadline =
      sp.planned_start_date
      - COALESCE(mf.lead_time_days, 7)
      - v_buffer,
    supply_status = CASE
      WHEN CURRENT_DATE >
        (sp.planned_start_date - COALESCE(mf.lead_time_days,7) - v_buffer)
        THEN 'critical'
      WHEN CURRENT_DATE >
        (sp.planned_start_date - COALESCE(mf.lead_time_days,7) - 5)
        THEN 'attention'
      ELSE 'ok'
    END,
    updated_at = now()
  FROM service_planning_by_period sp
  JOIN inputs i ON i.id = psr.input_id
  LEFT JOIN material_families mf ON mf.id = i.material_family_id
  WHERE psr.service_plan_id = sp.id
    AND psr.planning_period_id = p_planning_period_id
    AND sp.planned_start_date IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_period_item_supply_risk(uuid) TO authenticated;