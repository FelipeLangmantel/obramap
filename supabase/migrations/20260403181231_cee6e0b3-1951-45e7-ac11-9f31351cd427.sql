
-- CRITICAL 1: Expand supply_alerts status constraint
ALTER TABLE public.supply_alerts
  DROP CONSTRAINT IF EXISTS supply_alerts_status_check;

ALTER TABLE public.supply_alerts
  ADD CONSTRAINT supply_alerts_status_check
  CHECK (status IN ('pending','quoted','approved','ordered','in_transit','delivered','contracted','delayed'));

-- IMPORTANT 6: Company-level supply KPIs RPC
CREATE OR REPLACE FUNCTION public.get_company_supply_kpis(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'total_pending', COUNT(*) FILTER (WHERE sa.status IN ('pending','delayed')),
      'total_critical', COUNT(*) FILTER (WHERE sa.is_critical = true AND sa.status IN ('pending','delayed')),
      'total_overdue', COUNT(*) FILTER (WHERE sa.order_by_date < CURRENT_DATE AND sa.status NOT IN ('delivered','contracted')),
      'total_in_transit', COUNT(*) FILTER (WHERE sa.status = 'in_transit'),
      'total_pending_value', COALESCE(SUM(sa.total_value) FILTER (WHERE sa.status NOT IN ('delivered','contracted')), 0)
    )
    FROM supply_alerts sa
    JOIN projects p ON p.id = sa.project_id
    WHERE p.company_id = p_company_id
  );
END; $$;
