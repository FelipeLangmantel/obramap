-- ============================================================
-- TABELA: budget_service_inputs (composição de insumos por serviço)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.budget_service_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NOT NULL,
  macro_id uuid NOT NULL,
  scope_id uuid NOT NULL,
  service_name text,
  input_id uuid NOT NULL REFERENCES public.inputs(id) ON DELETE CASCADE,
  input_name text,
  quantity_per_unit numeric NOT NULL DEFAULT 0,
  unit text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT fk_bsi_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_bsi_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_bsi_company ON public.budget_service_inputs(company_id);
CREATE INDEX IF NOT EXISTS idx_bsi_project ON public.budget_service_inputs(project_id);
CREATE INDEX IF NOT EXISTS idx_bsi_macro_scope ON public.budget_service_inputs(macro_id, scope_id);
CREATE INDEX IF NOT EXISTS idx_bsi_input ON public.budget_service_inputs(input_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_bsi_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bsi_updated_at ON public.budget_service_inputs;
CREATE TRIGGER trg_bsi_updated_at
BEFORE UPDATE ON public.budget_service_inputs
FOR EACH ROW
EXECUTE FUNCTION public.set_bsi_updated_at();

-- RLS
ALTER TABLE public.budget_service_inputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view budget inputs of their company" ON public.budget_service_inputs;
CREATE POLICY "Users can view budget inputs of their company"
ON public.budget_service_inputs FOR SELECT
USING (
  company_id IN (
    SELECT p.company_id FROM profiles p WHERE p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can manage budget inputs of their company" ON public.budget_service_inputs;
CREATE POLICY "Users can manage budget inputs of their company"
ON public.budget_service_inputs FOR ALL
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