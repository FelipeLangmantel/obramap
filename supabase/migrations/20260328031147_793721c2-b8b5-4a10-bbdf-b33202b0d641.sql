
-- Table 1: Fornecedores configurados para simulação de cashflow
CREATE TABLE public.cashflow_sim_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cashflow_sim_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage cashflow sim suppliers for their company"
ON public.cashflow_sim_suppliers
FOR ALL
TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- Table 2: Configuração de insumos para simulação (condições de pagamento por insumo)
CREATE TABLE public.cashflow_sim_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  budget_service_input_id UUID REFERENCES public.budget_service_inputs(id) ON DELETE CASCADE,
  input_id UUID NOT NULL,
  input_name TEXT NOT NULL,
  macro_id UUID NOT NULL,
  scope_id UUID NOT NULL,
  supplier_name TEXT,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  reference_price NUMERIC NOT NULL DEFAULT 0,
  lead_time_days INTEGER NOT NULL DEFAULT 7,
  installment_1_days INTEGER NOT NULL DEFAULT 0,
  installment_1_pct NUMERIC NOT NULL DEFAULT 100,
  installment_2_days INTEGER NOT NULL DEFAULT 0,
  installment_2_pct NUMERIC NOT NULL DEFAULT 0,
  installment_3_days INTEGER NOT NULL DEFAULT 0,
  installment_3_pct NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cashflow_sim_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage cashflow sim inputs for their company"
ON public.cashflow_sim_inputs
FOR ALL
TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- Table 3: Simulações salvas (snapshot de configuração)
CREATE TABLE public.cashflow_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  config_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cashflow_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage cashflow simulations for their company"
ON public.cashflow_simulations
FOR ALL
TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- Indexes
CREATE INDEX idx_cashflow_sim_inputs_project ON public.cashflow_sim_inputs(project_id);
CREATE INDEX idx_cashflow_sim_suppliers_project ON public.cashflow_sim_suppliers(project_id);
CREATE INDEX idx_cashflow_simulations_project ON public.cashflow_simulations(project_id);
