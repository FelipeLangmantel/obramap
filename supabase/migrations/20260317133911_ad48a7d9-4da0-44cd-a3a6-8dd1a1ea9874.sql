
-- 1. Tabela de empreiteiros (vinculada a suppliers)
CREATE TABLE public.contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  cpf_cnpj TEXT,
  phone TEXT,
  email TEXT,
  -- Dados bancários
  bank_name TEXT,
  bank_agency TEXT,
  bank_account TEXT,
  bank_account_type TEXT DEFAULT 'corrente',
  pix_key TEXT,
  pix_key_type TEXT,
  -- Endereço
  address TEXT,
  city TEXT,
  state TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Contratos do empreiteiro por obra
CREATE TABLE public.contractor_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  contractor_id UUID NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  contract_number TEXT,
  retention_percent NUMERIC NOT NULL DEFAULT 5,
  total_value NUMERIC NOT NULL DEFAULT 0,
  total_measured NUMERIC NOT NULL DEFAULT 0,
  total_retained NUMERIC NOT NULL DEFAULT 0,
  total_paid NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, contractor_id)
);

-- 3. Serviços atribuídos ao contrato do empreiteiro
CREATE TABLE public.contractor_contract_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contractor_contracts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  macro_id TEXT NOT NULL,
  macro_name TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  scope_name TEXT NOT NULL,
  budget_unit_value NUMERIC NOT NULL DEFAULT 0,
  negotiated_unit_value NUMERIC NOT NULL DEFAULT 0,
  house_ids INTEGER[] NOT NULL DEFAULT '{}',
  total_houses INTEGER NOT NULL DEFAULT 0,
  total_value NUMERIC NOT NULL DEFAULT 0,
  measured_houses INTEGER NOT NULL DEFAULT 0,
  measured_value NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Medições do empreiteiro
CREATE TABLE public.contractor_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contractor_contracts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  measurement_number INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_value NUMERIC NOT NULL DEFAULT 0,
  retention_value NUMERIC NOT NULL DEFAULT 0,
  net_value NUMERIC NOT NULL DEFAULT 0,
  retention_percent NUMERIC NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'draft',
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  payment_due_date DATE,
  payment_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contract_id, measurement_number)
);

-- 5. Itens medidos em cada medição
CREATE TABLE public.contractor_measurement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  measurement_id UUID NOT NULL REFERENCES public.contractor_measurements(id) ON DELETE CASCADE,
  contract_service_id UUID NOT NULL REFERENCES public.contractor_contract_services(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  house_ids INTEGER[] NOT NULL DEFAULT '{}',
  houses_measured INTEGER NOT NULL DEFAULT 0,
  unit_value NUMERIC NOT NULL DEFAULT 0,
  total_value NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_contract_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_measurement_items ENABLE ROW LEVEL SECURITY;

-- Policies para contractors
CREATE POLICY "Users can view own company contractors"
  ON public.contractors FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

CREATE POLICY "Users can insert own company contractors"
  ON public.contractors FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

CREATE POLICY "Users can update own company contractors"
  ON public.contractors FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

CREATE POLICY "Users can delete own company contractors"
  ON public.contractors FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- Policies para contractor_contracts
CREATE POLICY "Users can view own company contractor contracts"
  ON public.contractor_contracts FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

CREATE POLICY "Users can insert own company contractor contracts"
  ON public.contractor_contracts FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

CREATE POLICY "Users can update own company contractor contracts"
  ON public.contractor_contracts FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

CREATE POLICY "Users can delete own company contractor contracts"
  ON public.contractor_contracts FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- Policies para contractor_contract_services
CREATE POLICY "Users can view own company contractor contract services"
  ON public.contractor_contract_services FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

CREATE POLICY "Users can insert own company contractor contract services"
  ON public.contractor_contract_services FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

CREATE POLICY "Users can update own company contractor contract services"
  ON public.contractor_contract_services FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

CREATE POLICY "Users can delete own company contractor contract services"
  ON public.contractor_contract_services FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- Policies para contractor_measurements
CREATE POLICY "Users can view own company contractor measurements"
  ON public.contractor_measurements FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

CREATE POLICY "Users can insert own company contractor measurements"
  ON public.contractor_measurements FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

CREATE POLICY "Users can update own company contractor measurements"
  ON public.contractor_measurements FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

CREATE POLICY "Users can delete own company contractor measurements"
  ON public.contractor_measurements FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- Policies para contractor_measurement_items
CREATE POLICY "Users can view own company contractor measurement items"
  ON public.contractor_measurement_items FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

CREATE POLICY "Users can insert own company contractor measurement items"
  ON public.contractor_measurement_items FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

CREATE POLICY "Users can update own company contractor measurement items"
  ON public.contractor_measurement_items FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

CREATE POLICY "Users can delete own company contractor measurement items"
  ON public.contractor_measurement_items FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));
