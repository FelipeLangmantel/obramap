-- ============================================================
-- PASSO 12.1 — CENÁRIOS DE PLANEJAMENTO (SIMULAÇÕES)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.planning_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_base boolean DEFAULT false,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_planning_scenarios_project
  ON public.planning_scenarios(project_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_base_scenario_per_project
  ON public.planning_scenarios(project_id)
  WHERE is_base = true;

-- RLS
ALTER TABLE public.planning_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view planning_scenarios of their company"
ON public.planning_scenarios
FOR SELECT
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins manage planning_scenarios"
ON public.planning_scenarios
FOR ALL
USING (is_company_admin(auth.uid(), company_id))
WITH CHECK (is_company_admin(auth.uid(), company_id));

-- Trigger updated_at
CREATE TRIGGER trg_planning_scenarios_updated_at
BEFORE UPDATE ON public.planning_scenarios
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();