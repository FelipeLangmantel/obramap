
-- Fix get_company_supply_kpis to read from supply_requests instead of empty supply_alerts
CREATE OR REPLACE FUNCTION public.get_company_supply_kpis(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'total_pending', COUNT(*) FILTER (WHERE sr.status IN ('alert','quoted')),
      'total_critical', COUNT(*) FILTER (WHERE sr.is_critical = true AND sr.status IN ('alert','quoted')),
      'total_overdue', COUNT(*) FILTER (WHERE sr.order_by_date < CURRENT_DATE AND sr.status NOT IN ('delivered','cancelled','ordered')),
      'total_in_transit', COUNT(*) FILTER (WHERE sr.status = 'ordered'),
      'total_pending_value', COALESCE(SUM(sr.total_value) FILTER (WHERE sr.status NOT IN ('delivered','cancelled')), 0)
    )
    FROM supply_requests sr
    JOIN projects p ON p.id = sr.project_id
    WHERE p.company_id = p_company_id
  );
END; $$;
