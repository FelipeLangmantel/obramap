-- 1. Adicionar company_id na tabela departments para isolar por empresa
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Remover constraint UNIQUE global
ALTER TABLE public.departments
  DROP CONSTRAINT IF EXISTS departments_name_key;

ALTER TABLE public.departments
  ADD CONSTRAINT departments_name_company_unique UNIQUE (name, company_id);

-- Corrigir RLS para isolamento por empresa
DROP POLICY IF EXISTS "Anyone can view departments" ON public.departments;
DROP POLICY IF EXISTS "Admins can manage departments" ON public.departments;

CREATE POLICY "departments_view" ON public.departments
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    OR company_id IS NULL
  );

CREATE POLICY "departments_manage" ON public.departments
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

-- 2. Criar tabela de permissões por departamento
CREATE TABLE IF NOT EXISTS public.department_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  department_name TEXT NOT NULL,
  visible_menus TEXT[] NOT NULL DEFAULT '{}',
  visible_management_sections TEXT[] NOT NULL DEFAULT '{}',
  can_edit BOOLEAN NOT NULL DEFAULT true,
  allowed_project_ids UUID[] DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, department_name)
);

ALTER TABLE public.department_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dept_permissions_company" ON public.department_permissions
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_dept_permissions_company_dept
  ON public.department_permissions(company_id, department_name);

GRANT ALL ON public.department_permissions TO authenticated;

-- 3. Adicionar can_edit em user_permissions
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS can_edit BOOLEAN DEFAULT NULL;