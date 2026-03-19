
-- Add contractor allocation columns to weekly_plan_services
ALTER TABLE public.weekly_plan_services
  ADD COLUMN IF NOT EXISTS contractor_id UUID REFERENCES public.contractors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contractor_name TEXT,
  ADD COLUMN IF NOT EXISTS contractor_house_ids INTEGER[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contractor_houses INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_out_of_contract_houses BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS out_of_contract_house_ids INTEGER[] NOT NULL DEFAULT '{}';

-- Contractor allocation change log table
CREATE TABLE IF NOT EXISTS public.weekly_plan_contractor_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_plan_service_id UUID NOT NULL REFERENCES public.weekly_plan_services(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  macro_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  scope_name TEXT NOT NULL,
  previous_contractor_id UUID REFERENCES public.contractors(id) ON DELETE SET NULL,
  previous_contractor_name TEXT,
  previous_house_ids INTEGER[] NOT NULL DEFAULT '{}',
  new_contractor_id UUID REFERENCES public.contractors(id) ON DELETE SET NULL,
  new_contractor_name TEXT,
  new_house_ids INTEGER[] NOT NULL DEFAULT '{}',
  transferred_house_ids INTEGER[] NOT NULL DEFAULT '{}',
  change_reason TEXT,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.weekly_plan_contractor_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_isolation_wpcl"
  ON public.weekly_plan_contractor_log
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_wpcl_service ON public.weekly_plan_contractor_log(weekly_plan_service_id);
CREATE INDEX IF NOT EXISTS idx_wpcl_project ON public.weekly_plan_contractor_log(project_id, week_start);
