-- Fix: remove dependency on nonexistent planning_periods.working_days
-- and prevent capacity recalculation on target_houses updates (Long-Term Planning saves targets).

CREATE OR REPLACE FUNCTION public.recalculate_service_capacity(
  p_service_planning_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target integer;
  v_productivity numeric;
  v_teams integer;
  v_days integer;
  v_capacity numeric;
BEGIN
  SELECT 
    sp.target_houses,
    sp.productivity_planned,
    sp.teams_planned,
    -- working_days column does not exist; derive from period dates instead
    GREATEST(0, (pp.end_date - pp.start_date + 1))::int
  INTO
    v_target,
    v_productivity,
    v_teams,
    v_days
  FROM public.service_planning_by_period sp
  JOIN public.planning_periods pp ON pp.id = sp.planning_period_id
  WHERE sp.id = p_service_planning_id;

  v_capacity := COALESCE(v_productivity, 0) * COALESCE(v_teams, 0) * COALESCE(v_days, 0);

  UPDATE public.service_planning_by_period
  SET
    available_days = v_days,
    production_capacity = v_capacity,
    capacity_status = CASE
      WHEN v_capacity < v_target * 0.85 THEN 'critical'
      WHEN v_capacity < v_target THEN 'attention'
      ELSE 'ok'
    END,
    updated_at = now()
  WHERE id = p_service_planning_id;
END;
$$;

-- Ensure trigger does not fire on target_houses changes (strategic planning edits)
DROP TRIGGER IF EXISTS trg_recalc_capacity_service ON public.service_planning_by_period;

CREATE TRIGGER trg_recalc_capacity_service
AFTER UPDATE OF productivity_planned, teams_planned
ON public.service_planning_by_period
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalc_service_capacity();

-- Keep permissions
GRANT EXECUTE ON FUNCTION public.recalculate_service_capacity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_recalc_service_capacity() TO authenticated;
