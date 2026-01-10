-- ============================================================
-- PASSO 12.2 — SERVIÇOS SIMULADOS POR CENÁRIO
-- ============================================================

CREATE TABLE IF NOT EXISTS public.scenario_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES public.planning_scenarios(id) ON DELETE CASCADE,
  measurement_service_id uuid REFERENCES public.measurement_services(id) ON DELETE SET NULL,
  macro_id uuid,
  scope_id uuid,
  macro_name text,
  scope_name text,
  planned_houses integer NOT NULL DEFAULT 0,
  productivity_expected numeric DEFAULT 0,
  teams_expected integer DEFAULT 1,
  planned_cost numeric DEFAULT 0,
  simulated_duration_days integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_scenario_services_scenario
  ON public.scenario_services(scenario_id);

CREATE INDEX IF NOT EXISTS idx_scenario_services_macro_scope
  ON public.scenario_services(macro_id, scope_id);

-- Evitar duplicar mesmo serviço no mesmo cenário
CREATE UNIQUE INDEX IF NOT EXISTS ux_scenario_services_unique
  ON public.scenario_services(scenario_id, macro_id, scope_id);

-- RLS
ALTER TABLE public.scenario_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view scenario_services of their company"
ON public.scenario_services
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM planning_scenarios ps
    WHERE ps.id = scenario_services.scenario_id
      AND ps.company_id = get_user_company_id(auth.uid())
  )
);

CREATE POLICY "Admins manage scenario_services"
ON public.scenario_services
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM planning_scenarios ps
    WHERE ps.id = scenario_services.scenario_id
      AND is_company_admin(auth.uid(), ps.company_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM planning_scenarios ps
    WHERE ps.id = scenario_services.scenario_id
      AND is_company_admin(auth.uid(), ps.company_id)
  )
);

-- Trigger updated_at
CREATE TRIGGER trg_scenario_services_updated_at
BEFORE UPDATE ON public.scenario_services
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();