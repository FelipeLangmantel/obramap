-- Corrigir search_path na função estimate_service_duration_days
CREATE OR REPLACE FUNCTION public.estimate_service_duration_days(
  p_planned_houses integer,
  p_productivity_expected numeric,
  p_teams_expected integer
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE 
    WHEN p_productivity_expected > 0 AND p_teams_expected > 0 THEN
      CEIL(p_planned_houses::numeric / (p_productivity_expected * p_teams_expected))::integer
    ELSE
      0
  END;
$$;