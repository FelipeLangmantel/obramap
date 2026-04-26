-- RPC v2: calcula necessidade de mão de obra usando project_service_productivity
-- + project_service_team_composition (composição detalhada por função).
CREATE OR REPLACE FUNCTION public.calculate_labor_needs_v2(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(row_to_json(q) ORDER BY (q.period_number, q.macro_name, q.scope_name))
  INTO v_result
  FROM (
    SELECT
      pp.id AS period_id,
      pp.period_number,
      pp.start_date AS period_start,
      pp.end_date AS period_end,
      pp.name AS period_name,
      spb.macro_id,
      spb.scope_id,
      spb.macro_name,
      spb.scope_name,
      COALESCE(spb.target_houses, 0) AS planned_houses,
      COALESCE(spb.team_count, psp.default_team_count, 0) AS team_count,
      psp.id AS productivity_id,
      psp.productivity_value,
      psp.productivity_unit,
      psp.working_days_per_week,
      psp.professionals_per_team,
      psp.helpers_per_team,
      -- Composição detalhada (lista de funções)
      COALESCE(
        (
          SELECT jsonb_agg(jsonb_build_object(
            'role_name', tc.role_name,
            'role_type', tc.role_type,
            'qty_per_team', tc.quantity,
            'total', tc.quantity * COALESCE(spb.team_count, psp.default_team_count, 0)
          ) ORDER BY tc.role_type DESC, tc.role_name)
          FROM public.project_service_team_composition tc
          WHERE tc.productivity_id = psp.id
        ),
        '[]'::jsonb
      ) AS team_breakdown,
      -- Totais agregados a partir da composição (se houver), senão fallback para os contadores
      COALESCE(
        (
          SELECT SUM(tc.quantity)
          FROM public.project_service_team_composition tc
          WHERE tc.productivity_id = psp.id
            AND tc.role_type = 'professional'
        ),
        psp.professionals_per_team,
        0
      ) * COALESCE(spb.team_count, psp.default_team_count, 0) AS total_professionals,
      COALESCE(
        (
          SELECT SUM(tc.quantity)
          FROM public.project_service_team_composition tc
          WHERE tc.productivity_id = psp.id
            AND tc.role_type = 'helper'
        ),
        psp.helpers_per_team,
        0
      ) * COALESCE(spb.team_count, psp.default_team_count, 0) AS total_helpers,
      (psp.id IS NOT NULL) AS has_productivity_config,
      EXISTS (
        SELECT 1 FROM public.project_service_team_composition tc
        WHERE tc.productivity_id = psp.id
      ) AS has_team_composition
    FROM public.service_planning_by_period spb
    JOIN public.planning_periods pp ON pp.id = spb.planning_period_id
    LEFT JOIN public.project_service_productivity psp
      ON psp.project_id = spb.project_id
      AND psp.scope_id = spb.scope_id
      AND psp.is_active = true
    WHERE spb.project_id = p_project_id
      AND COALESCE(spb.target_houses, 0) > 0
  ) q;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- Garantir índice de leitura rápida (idempotente)
CREATE INDEX IF NOT EXISTS idx_pstc_productivity_role
  ON public.project_service_team_composition(productivity_id, role_type);

-- Permitir execução pelos usuários autenticados (mesma política de calculate_labor_needs)
GRANT EXECUTE ON FUNCTION public.calculate_labor_needs_v2(uuid) TO authenticated;