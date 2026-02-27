
-- ===== TABELA: service_productivities =====
CREATE TABLE public.service_productivities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  macro_id uuid NOT NULL,
  scope_id uuid NOT NULL,
  macro_name text NOT NULL,
  scope_name text NOT NULL,
  productivity_type text NOT NULL DEFAULT 'casa_por_dia',
  base_productivity numeric NOT NULL DEFAULT 1.0,
  team_composition jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, macro_id, scope_id)
);

CREATE INDEX idx_sp_company ON public.service_productivities(company_id);
CREATE INDEX idx_sp_macro ON public.service_productivities(macro_id);

ALTER TABLE public.service_productivities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sp_select" ON public.service_productivities FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));
CREATE POLICY "sp_insert" ON public.service_productivities FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));
CREATE POLICY "sp_update" ON public.service_productivities FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()))
  WITH CHECK (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));
CREATE POLICY "sp_delete" ON public.service_productivities FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- ===== TABELA: labor_histogram =====
CREATE TABLE public.labor_histogram (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  period_id uuid NOT NULL,
  period_number integer NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  macro_id uuid NOT NULL,
  scope_id uuid NOT NULL,
  macro_name text NOT NULL,
  scope_name text NOT NULL,
  planned_houses integer NOT NULL DEFAULT 0,
  productivity numeric NOT NULL DEFAULT 1.0,
  productivity_type text NOT NULL DEFAULT 'casa_por_dia',
  labor_needs jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_days numeric NOT NULL DEFAULT 0,
  total_professionals integer NOT NULL DEFAULT 0,
  total_helpers integer NOT NULL DEFAULT 0,
  estimated_cost numeric DEFAULT 0,
  status text DEFAULT 'pending',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(project_id, period_id, macro_id, scope_id)
);

CREATE INDEX idx_lh_project ON public.labor_histogram(project_id);
CREATE INDEX idx_lh_period ON public.labor_histogram(period_id);

ALTER TABLE public.labor_histogram ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lh_select" ON public.labor_histogram FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));
CREATE POLICY "lh_insert" ON public.labor_histogram FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));
CREATE POLICY "lh_update" ON public.labor_histogram FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()))
  WITH CHECK (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));
CREATE POLICY "lh_delete" ON public.labor_histogram FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- ===== RPC: calculate_labor_needs =====
CREATE OR REPLACE FUNCTION public.calculate_labor_needs(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(row_to_json(q))
  INTO v_result
  FROM (
    SELECT
      pp.id as period_id,
      pp.period_number,
      pp.start_date as period_start,
      pp.end_date as period_end,
      spb.macro_id,
      spb.scope_id,
      spb.macro_name,
      spb.scope_name,
      spb.target_houses as planned_houses,
      COALESCE(sp.base_productivity, 1.0) as productivity,
      COALESCE(sp.productivity_type, 'casa_por_dia') as productivity_type,
      COALESCE(sp.team_composition, '[]'::jsonb) as team_composition,
      CASE
        WHEN COALESCE(sp.productivity_type, 'casa_por_dia') = 'casa_por_dia'
          THEN CEIL(spb.target_houses::numeric / GREATEST(COALESCE(sp.base_productivity, 1.0), 0.01))
        WHEN sp.productivity_type = 'dias_por_casa'
          THEN CEIL(spb.target_houses::numeric * COALESCE(sp.base_productivity, 1.0))
        ELSE spb.target_houses::numeric
      END as duration_days,
      (
        SELECT COALESCE(SUM((t->>'quantity')::integer), 0)
        FROM jsonb_array_elements(COALESCE(sp.team_composition, '[]'::jsonb)) t
        WHERE t->>'unit' = 'profissional'
      ) as total_professionals,
      (
        SELECT COALESCE(SUM((t->>'quantity')::integer), 0)
        FROM jsonb_array_elements(COALESCE(sp.team_composition, '[]'::jsonb)) t
        WHERE t->>'unit' = 'auxiliar'
      ) as total_helpers
    FROM public.service_planning_by_period spb
    JOIN public.planning_periods pp ON pp.id = spb.planning_period_id
    LEFT JOIN public.service_productivities sp
      ON sp.macro_id = spb.macro_id
      AND sp.scope_id = spb.scope_id
      AND sp.company_id = spb.company_id
    WHERE spb.project_id = p_project_id
      AND spb.target_houses > 0
    ORDER BY pp.period_number, spb.macro_name, spb.scope_name
  ) q;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
