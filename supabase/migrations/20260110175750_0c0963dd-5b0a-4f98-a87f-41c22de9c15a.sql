-- ============================================================
-- FASE 16 — CRIAR TABELA project_contract_services
-- Armazena valores contratuais por serviço (macro/scope)
-- ============================================================

-- Tabela para valores contratuais por serviço
CREATE TABLE public.project_contract_services (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES project_contracts(id) ON DELETE CASCADE,
  macro_id text NOT NULL,
  macro_name text NOT NULL,
  scope_id text NOT NULL,
  scope_name text NOT NULL,
  unit_revenue_value numeric NOT NULL DEFAULT 0,
  max_cost_value numeric NOT NULL DEFAULT 0,
  cost_percent numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(contract_id, macro_id, scope_id)
);

-- Habilitar RLS
ALTER TABLE public.project_contract_services ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view contract services from their company"
ON public.project_contract_services
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.company_id = project_contract_services.company_id
  )
);

CREATE POLICY "Users can insert contract services for their company"
ON public.project_contract_services
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.company_id = project_contract_services.company_id
  )
);

CREATE POLICY "Users can update contract services from their company"
ON public.project_contract_services
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.company_id = project_contract_services.company_id
  )
);

CREATE POLICY "Users can delete contract services from their company"
ON public.project_contract_services
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.company_id = project_contract_services.company_id
  )
);

-- Adicionar coluna contract_number em project_contracts se não existir
ALTER TABLE public.project_contracts
ADD COLUMN IF NOT EXISTS contract_number text,
ADD COLUMN IF NOT EXISTS contract_date date DEFAULT CURRENT_DATE;

-- Trigger para updated_at
CREATE TRIGGER update_project_contract_services_updated_at
BEFORE UPDATE ON public.project_contract_services
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para performance
CREATE INDEX idx_pcs_project ON public.project_contract_services(project_id);
CREATE INDEX idx_pcs_contract ON public.project_contract_services(contract_id);
CREATE INDEX idx_pcs_company ON public.project_contract_services(company_id);