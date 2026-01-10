-- ============================================================
-- FASE 14.1 — NECESSIDADES DE INSUMOS POR PERÍODO
-- ============================================================

CREATE TABLE IF NOT EXISTS public.period_supply_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NOT NULL,
  planning_period_id uuid NOT NULL REFERENCES public.planning_periods(id) ON DELETE CASCADE,
  service_plan_id uuid NOT NULL REFERENCES public.service_planning_by_period(id) ON DELETE CASCADE,
  macro_id uuid,
  scope_id uuid,
  input_id uuid NOT NULL REFERENCES public.inputs(id),
  input_name text,
  unit text,
  quantity_required numeric NOT NULL DEFAULT 0,
  quantity_reserved numeric DEFAULT 0,
  quantity_ordered numeric DEFAULT 0,
  quantity_delivered numeric DEFAULT 0,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT fk_psr_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_psr_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_psr_period ON public.period_supply_requirements(planning_period_id);
CREATE INDEX IF NOT EXISTS idx_psr_project ON public.period_supply_requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_psr_input ON public.period_supply_requirements(input_id);
CREATE INDEX IF NOT EXISTS idx_psr_service ON public.period_supply_requirements(service_plan_id);
CREATE INDEX IF NOT EXISTS idx_psr_company ON public.period_supply_requirements(company_id);
CREATE INDEX IF NOT EXISTS idx_psr_status ON public.period_supply_requirements(status);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_psr_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_psr_updated_at ON public.period_supply_requirements;
CREATE TRIGGER trg_psr_updated_at
BEFORE UPDATE ON public.period_supply_requirements
FOR EACH ROW
EXECUTE FUNCTION public.set_psr_updated_at();

-- RLS
ALTER TABLE public.period_supply_requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view supply requirements of their company" ON public.period_supply_requirements;
CREATE POLICY "Users can view supply requirements of their company"
ON public.period_supply_requirements FOR SELECT
USING (
  company_id IN (
    SELECT p.company_id FROM profiles p WHERE p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can manage supply requirements of their company" ON public.period_supply_requirements;
CREATE POLICY "Users can manage supply requirements of their company"
ON public.period_supply_requirements FOR ALL
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