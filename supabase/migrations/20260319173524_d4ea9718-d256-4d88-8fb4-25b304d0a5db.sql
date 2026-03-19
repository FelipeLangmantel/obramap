-- Add contractor linkage to weekly plan services
ALTER TABLE public.weekly_plan_services
  ADD COLUMN contractor_contract_service_id UUID REFERENCES public.contractor_contract_services(id) ON DELETE SET NULL;

-- Index for fast lookups
CREATE INDEX idx_wps_contractor ON public.weekly_plan_services(contractor_contract_service_id) WHERE contractor_contract_service_id IS NOT NULL;

-- Contractor productivity tracking per measurement period
CREATE TABLE public.contractor_period_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  contractor_contract_id UUID NOT NULL REFERENCES public.contractor_contracts(id) ON DELETE CASCADE,
  planning_period_id UUID NOT NULL REFERENCES public.planning_periods(id) ON DELETE CASCADE,
  
  macro_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  macro_name TEXT NOT NULL,
  scope_name TEXT NOT NULL,
  
  planned_houses INTEGER NOT NULL DEFAULT 0,
  completed_houses INTEGER NOT NULL DEFAULT 0,
  completion_percent NUMERIC NOT NULL DEFAULT 0,
  
  planned_value NUMERIC NOT NULL DEFAULT 0,
  executed_value NUMERIC NOT NULL DEFAULT 0,
  
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'delayed')),
  
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(contractor_contract_id, planning_period_id, macro_id, scope_id)
);

ALTER TABLE public.contractor_period_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company isolation for contractor_period_performance"
  ON public.contractor_period_performance
  FOR ALL
  TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
