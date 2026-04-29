
-- =========================================================
-- 1. PROFESSIONS catalog (per company)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.professions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Outros',
  worker_type text NOT NULL DEFAULT 'professional' CHECK (worker_type IN ('professional','helper')),
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_professions_company ON public.professions(company_id) WHERE active;

ALTER TABLE public.professions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "professions_select_own_company"
  ON public.professions FOR SELECT
  USING (company_id = public.get_my_company_id());

CREATE POLICY "professions_insert_can_write"
  ON public.professions FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.can_write());

CREATE POLICY "professions_update_can_write"
  ON public.professions FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.can_write());

CREATE POLICY "professions_delete_can_write"
  ON public.professions FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.can_write());

CREATE TRIGGER trg_professions_updated_at
  BEFORE UPDATE ON public.professions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 2. EMPLOYEES (own workforce)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  cpf text,
  profession text,
  worker_type text NOT NULL DEFAULT 'professional' CHECK (worker_type IN ('professional','helper')),
  cost_per_hour numeric(12,2) CHECK (cost_per_hour IS NULL OR cost_per_hour >= 0),
  hire_date date,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employees_company ON public.employees(company_id) WHERE active;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_employees_company_cpf
  ON public.employees(company_id, cpf) WHERE cpf IS NOT NULL;

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees_select_own_company"
  ON public.employees FOR SELECT
  USING (company_id = public.get_my_company_id());

CREATE POLICY "employees_insert_can_write"
  ON public.employees FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id() AND public.can_write());

CREATE POLICY "employees_update_can_write"
  ON public.employees FOR UPDATE
  USING (company_id = public.get_my_company_id() AND public.can_write());

CREATE POLICY "employees_delete_can_write"
  ON public.employees FOR DELETE
  USING (company_id = public.get_my_company_id() AND public.can_write());

CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 3. INTERNAL CONTRACTOR FLAGS
-- =========================================================
ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

ALTER TABLE public.contractor_contracts
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_contractors_one_internal_per_company
  ON public.contractors(company_id) WHERE is_internal = true;

-- =========================================================
-- 4. HELPERS: ensure internal contractor + per-project contract
-- =========================================================
CREATE OR REPLACE FUNCTION public.ensure_internal_contractor(_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  SELECT id INTO _id
    FROM public.contractors
   WHERE company_id = _company_id AND is_internal = true
   LIMIT 1;

  IF _id IS NULL THEN
    INSERT INTO public.contractors (company_id, name, is_internal)
    VALUES (_company_id, 'Mão de Obra Própria', true)
    RETURNING id INTO _id;
  END IF;

  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_internal_contract(_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company uuid;
  _contractor uuid;
  _contract uuid;
BEGIN
  SELECT company_id INTO _company FROM public.projects WHERE id = _project_id;
  IF _company IS NULL THEN
    RAISE EXCEPTION 'Projeto não encontrado';
  END IF;

  _contractor := public.ensure_internal_contractor(_company);

  SELECT id INTO _contract
    FROM public.contractor_contracts
   WHERE project_id = _project_id AND is_internal = true
   LIMIT 1;

  IF _contract IS NULL THEN
    INSERT INTO public.contractor_contracts (
      company_id, project_id, contractor_id, is_internal, status, contract_number
    ) VALUES (
      _company, _project_id, _contractor, true, 'ativo', 'INTERNO'
    )
    RETURNING id INTO _contract;
  END IF;

  RETURN _contract;
END;
$$;

-- =========================================================
-- 5. SEED professions per existing company (idempotent)
-- =========================================================
CREATE OR REPLACE FUNCTION public.seed_professions_for_company(_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.professions (company_id, name, category, worker_type, active)
  VALUES
    -- Estrutura / Alvenaria
    (_company_id,'Pedreiro','Estrutura / Alvenaria','professional',true),
    (_company_id,'Auxiliar de Pedreiro','Estrutura / Alvenaria','helper',true),
    (_company_id,'Servente','Estrutura / Alvenaria','helper',true),
    (_company_id,'Auxiliar de Servente','Estrutura / Alvenaria','helper',true),
    (_company_id,'Armador','Estrutura / Alvenaria','professional',true),
    (_company_id,'Auxiliar de Armador','Estrutura / Alvenaria','helper',true),
    (_company_id,'Carpinteiro','Estrutura / Alvenaria','professional',true),
    (_company_id,'Auxiliar de Carpinteiro','Estrutura / Alvenaria','helper',true),
    (_company_id,'Operador de Betoneira','Estrutura / Alvenaria','professional',true),
    -- Instalações
    (_company_id,'Eletricista','Instalações','professional',true),
    (_company_id,'Auxiliar de Eletricista','Instalações','helper',true),
    (_company_id,'Encanador','Instalações','professional',true),
    (_company_id,'Auxiliar de Encanador','Instalações','helper',true),
    (_company_id,'Instalador de Gás','Instalações','professional',true),
    (_company_id,'Bombeiro Hidráulico','Instalações','professional',true),
    -- Acabamentos
    (_company_id,'Azulejista','Acabamentos','professional',true),
    (_company_id,'Auxiliar de Azulejista','Acabamentos','helper',true),
    (_company_id,'Pintor','Acabamentos','professional',true),
    (_company_id,'Auxiliar de Pintor','Acabamentos','helper',true),
    (_company_id,'Gesseiro','Acabamentos','professional',true),
    (_company_id,'Auxiliar de Gesseiro','Acabamentos','helper',true),
    (_company_id,'Marmorista','Acabamentos','professional',true),
    (_company_id,'Marceneiro','Acabamentos','professional',true),
    (_company_id,'Vidraceiro','Acabamentos','professional',true),
    -- Cobertura
    (_company_id,'Telhadista','Cobertura','professional',true),
    (_company_id,'Auxiliar de Telhadista','Cobertura','helper',true),
    (_company_id,'Calheiro','Cobertura','professional',true),
    (_company_id,'Impermeabilizador','Cobertura','professional',true),
    -- Externos / Apoio
    (_company_id,'Pavimentador','Externos / Apoio','professional',true),
    (_company_id,'Jardineiro','Externos / Apoio','professional',true),
    (_company_id,'Operador de Máquinas','Externos / Apoio','professional',true),
    (_company_id,'Sinalizador','Externos / Apoio','helper',true),
    (_company_id,'Apontador','Externos / Apoio','professional',true),
    (_company_id,'Encarregado','Externos / Apoio','professional',true),
    (_company_id,'Mestre de Obras','Externos / Apoio','professional',true)
  ON CONFLICT (company_id, name) DO NOTHING;
END;
$$;

-- Run seed for all existing companies
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.companies LOOP
    PERFORM public.seed_professions_for_company(r.id);
    PERFORM public.ensure_internal_contractor(r.id);
  END LOOP;
END $$;
