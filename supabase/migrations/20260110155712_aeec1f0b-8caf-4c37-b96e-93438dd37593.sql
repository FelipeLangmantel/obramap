-- ============================================================
-- FASE 13.3 — PLANEJAMENTO DE SERVIÇOS POR PERÍODO (MEDIÇÃO)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_planning_by_period (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NOT NULL,
  contract_id uuid,
  planning_period_id uuid NOT NULL REFERENCES public.planning_periods(id) ON DELETE CASCADE,
  macro_id uuid,
  scope_id uuid,
  macro_name text,
  scope_name text,
  target_houses integer DEFAULT 0,
  unit_revenue_value numeric DEFAULT 0,
  unit_cost_value numeric DEFAULT 0,
  planned_revenue numeric DEFAULT 0,
  planned_cost numeric DEFAULT 0,
  projected_result numeric DEFAULT 0,
  realized_houses integer DEFAULT 0,
  realized_cost numeric DEFAULT 0,
  realized_revenue numeric DEFAULT 0,
  real_result numeric DEFAULT 0,
  performance_percent numeric DEFAULT 0,
  status text DEFAULT 'planned',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT fk_spbp_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_spbp_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_spbp_contract FOREIGN KEY (contract_id) REFERENCES project_contracts(id) ON DELETE SET NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_spbp_period
  ON public.service_planning_by_period(planning_period_id);

CREATE INDEX IF NOT EXISTS idx_spbp_project
  ON public.service_planning_by_period(project_id);

CREATE INDEX IF NOT EXISTS idx_spbp_macro_scope
  ON public.service_planning_by_period(macro_id, scope_id);

CREATE INDEX IF NOT EXISTS idx_spbp_company
  ON public.service_planning_by_period(company_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_spbp_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spbp_updated_at ON public.service_planning_by_period;
CREATE TRIGGER trg_spbp_updated_at
BEFORE UPDATE ON public.service_planning_by_period
FOR EACH ROW
EXECUTE FUNCTION public.set_spbp_updated_at();

-- RLS
ALTER TABLE public.service_planning_by_period ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view service planning of their company" ON public.service_planning_by_period;
CREATE POLICY "Users can view service planning of their company"
ON public.service_planning_by_period FOR SELECT
USING (
  company_id IN (
    SELECT p.company_id FROM profiles p WHERE p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can manage service planning of their company" ON public.service_planning_by_period;
CREATE POLICY "Users can manage service planning of their company"
ON public.service_planning_by_period FOR ALL
USING (
  company_id IN (
    SELECT p.company_id FROM profiles p WHERE p.user_id = auth.uid()
  )
)
WITH CHECK (
  company_id IN (
    SELECT p.company_id FROM profiles p WHERE p.user_id = auth.uid()
  )
);