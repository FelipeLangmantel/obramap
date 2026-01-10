-- =============================================
-- FASE 1: PROJECT_CONTRACTS (Contrato da Obra)
-- =============================================

-- 1. Criar tabela project_contracts
CREATE TABLE public.project_contracts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  contract_value_total numeric NOT NULL DEFAULT 0,
  cost_target_percent numeric NOT NULL DEFAULT 0.68, -- Meta de custo padrão (68%)
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Constraint: Um contrato por projeto/empresa
  CONSTRAINT project_contracts_unique UNIQUE (company_id, project_id)
);

-- 2. Comentários explicativos
COMMENT ON TABLE public.project_contracts IS 'Contrato principal de cada obra, com valor total e meta de custo';
COMMENT ON COLUMN public.project_contracts.contract_value_total IS 'Valor total do contrato da obra';
COMMENT ON COLUMN public.project_contracts.cost_target_percent IS 'Meta de custo como percentual da receita (ex: 0.68 = 68%)';

-- 3. Índices para performance
CREATE INDEX idx_project_contracts_company ON public.project_contracts(company_id);
CREATE INDEX idx_project_contracts_project ON public.project_contracts(project_id);

-- 4. Trigger para updated_at
CREATE TRIGGER update_project_contracts_updated_at
  BEFORE UPDATE ON public.project_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 5. RLS
ALTER TABLE public.project_contracts ENABLE ROW LEVEL SECURITY;

-- Policy: System admin pode tudo
CREATE POLICY "System admin full access on project_contracts"
  ON public.project_contracts
  FOR ALL
  USING (public.is_system_admin(auth.uid()));

-- Policy: Usuários da empresa podem ver/editar
CREATE POLICY "Company users can manage project_contracts"
  ON public.project_contracts
  FOR ALL
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

-- 6. Função helper para obter valor do contrato
CREATE OR REPLACE FUNCTION public.get_project_contract_value(p_project_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(contract_value_total, 0)
  FROM project_contracts
  WHERE project_id = p_project_id
  LIMIT 1;
$$;

-- 7. Função helper para obter meta de custo
CREATE OR REPLACE FUNCTION public.get_project_cost_target_percent(p_project_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(cost_target_percent, 0.68)
  FROM project_contracts
  WHERE project_id = p_project_id
  LIMIT 1;
$$;