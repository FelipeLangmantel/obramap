-- ============================================================
-- FASE 15.1 — REQUISIÇÕES DE COMPRA POR PERÍODO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NOT NULL,
  planning_period_id uuid NOT NULL REFERENCES public.planning_periods(id) ON DELETE CASCADE,
  requested_by uuid,
  status text DEFAULT 'open', -- open | approved | cancelled
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT fk_pr_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_pr_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pr_company ON public.purchase_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_pr_project ON public.purchase_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_pr_period ON public.purchase_requests(planning_period_id);
CREATE INDEX IF NOT EXISTS idx_pr_status ON public.purchase_requests(status);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_pr_updated_at()
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

DROP TRIGGER IF EXISTS trg_pr_updated_at ON public.purchase_requests;

CREATE TRIGGER trg_pr_updated_at
BEFORE UPDATE ON public.purchase_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_pr_updated_at();

-- RLS
ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view purchase requests of company"
ON public.purchase_requests FOR SELECT
USING (company_id IN (SELECT company_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users manage purchase requests of company"
ON public.purchase_requests FOR ALL
USING (company_id IN (SELECT company_id FROM profiles WHERE user_id = auth.uid()))
WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE user_id = auth.uid()));