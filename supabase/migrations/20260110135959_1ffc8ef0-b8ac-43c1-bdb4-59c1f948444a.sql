-- ============================================================
-- PASSO 12.4 — PLANEJAMENTO FÍSICO-FINANCEIRO POR SERVIÇO
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_planning_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scenario_id uuid REFERENCES public.planning_scenarios(id) ON DELETE CASCADE,
  measurement_number integer,
  period_start date NOT NULL,
  period_end date NOT NULL,
  macro_id uuid,
  scope_id uuid,
  macro_name text,
  scope_name text,
  planned_houses integer NOT NULL DEFAULT 0,
  teams_planned integer NOT NULL DEFAULT 1,
  productivity_planned numeric NOT NULL DEFAULT 0,
  planned_duration_days integer NOT NULL DEFAULT 0,
  planned_cost numeric NOT NULL DEFAULT 0,
  planned_revenue numeric NOT NULL DEFAULT 0,
  planned_margin numeric NOT NULL DEFAULT 0,
  is_locked boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_planning_targets_period_check
    CHECK (period_end >= period_start)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_spt_project
  ON public.service_planning_targets(project_id);

CREATE INDEX IF NOT EXISTS idx_spt_scenario
  ON public.service_planning_targets(scenario_id);

CREATE INDEX IF NOT EXISTS idx_spt_measurement
  ON public.service_planning_targets(project_id, measurement_number);

CREATE INDEX IF NOT EXISTS idx_spt_service
  ON public.service_planning_targets(macro_id, scope_id);

-- RLS
ALTER TABLE public.service_planning_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users view service planning targets"
ON public.service_planning_targets FOR SELECT
USING (
  user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Company admins manage service planning targets"
ON public.service_planning_targets FOR ALL
USING (
  is_company_admin(auth.uid(), company_id)
)
WITH CHECK (
  is_company_admin(auth.uid(), company_id)
);

-- Trigger updated_at
CREATE TRIGGER trg_update_spt_updated_at
BEFORE UPDATE ON public.service_planning_targets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();