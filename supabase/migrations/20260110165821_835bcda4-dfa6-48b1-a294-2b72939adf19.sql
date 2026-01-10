-- ============================================================
-- FASE 17.1 — ALOCAÇÃO DE CASAS AO PLANEJAMENTO DE SERVIÇO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.service_house_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NOT NULL,
  planning_period_id uuid NOT NULL REFERENCES public.planning_periods(id) ON DELETE CASCADE,
  service_plan_id uuid NOT NULL REFERENCES public.service_planning_by_period(id) ON DELETE CASCADE,
  house_id uuid NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  macro_id uuid,
  scope_id uuid,
  status text DEFAULT 'planned',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT fk_sha_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_sha_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Cada casa só pode estar em um período por serviço
CREATE UNIQUE INDEX IF NOT EXISTS ux_house_service_period
ON public.service_house_allocations(house_id, macro_id, scope_id);

-- Índices
CREATE INDEX IF NOT EXISTS idx_sha_period ON public.service_house_allocations(planning_period_id);
CREATE INDEX IF NOT EXISTS idx_sha_service ON public.service_house_allocations(service_plan_id);
CREATE INDEX IF NOT EXISTS idx_sha_house ON public.service_house_allocations(house_id);
CREATE INDEX IF NOT EXISTS idx_sha_company ON public.service_house_allocations(company_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_sha_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sha_updated_at ON public.service_house_allocations;

CREATE TRIGGER trg_sha_updated_at
BEFORE UPDATE ON public.service_house_allocations
FOR EACH ROW
EXECUTE FUNCTION public.set_sha_updated_at();

-- RLS
ALTER TABLE public.service_house_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view service house allocations of company"
ON public.service_house_allocations FOR SELECT
USING (
  company_id IN (
    SELECT p.company_id FROM profiles p WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "Users manage service house allocations of company"
ON public.service_house_allocations FOR ALL
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