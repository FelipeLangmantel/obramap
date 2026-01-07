-- =====================================================
-- ARQUITETURA MULTIEMPRESAS - MIGRAÇÃO COMPLETA
-- =====================================================

-- 1. CRIAR NOVO ENUM PARA PAPÉIS DO SISTEMA
CREATE TYPE public.system_role AS ENUM ('system_admin', 'admin', 'user');

-- 2. ADICIONAR CAMPOS À TABELA COMPANIES
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Criar função para gerar slug único
CREATE OR REPLACE FUNCTION public.generate_unique_slug(company_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Gerar slug base (lowercase, remove acentos, substitui espaços por hífens)
  base_slug := lower(regexp_replace(
    translate(company_name, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 
              'aaaaaeeeeiiiioooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'),
    '[^a-zA-Z0-9]+', '-', 'g'
  ));
  
  -- Remover hífens duplicados e nas pontas
  base_slug := trim(BOTH '-' FROM regexp_replace(base_slug, '-+', '-', 'g'));
  
  final_slug := base_slug;
  
  -- Verificar unicidade e adicionar contador se necessário
  WHILE EXISTS (SELECT 1 FROM public.companies WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  RETURN final_slug;
END;
$$;

-- Gerar slugs para empresas existentes
UPDATE public.companies 
SET slug = public.generate_unique_slug(name) 
WHERE slug IS NULL;

-- Tornar slug NOT NULL após popular
ALTER TABLE public.companies ALTER COLUMN slug SET NOT NULL;

-- 3. ADICIONAR CAMPOS À TABELA PROFILES
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS system_role system_role DEFAULT 'user';

-- Migrar roles existentes para system_role
UPDATE public.profiles p
SET system_role = CASE 
  WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role = 'admin') THEN 'admin'::system_role
  ELSE 'user'::system_role
END;

-- Tornar company_id obrigatório para usuários não system_admin (constraint adicionada via trigger)

-- 4. CRIAR TABELA DE CONTROLE DE EMPRESAS E PROJETOS
-- Adicionar company_id à tabela projects se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'company_id') THEN
    ALTER TABLE public.projects ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 5. FUNÇÕES DE SEGURANÇA

-- Função para verificar se é SYSTEM_ADMIN
CREATE OR REPLACE FUNCTION public.is_system_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id
      AND system_role = 'system_admin'
      AND status = 'active'
  )
$$;

-- Função para obter company_id do usuário
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.profiles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Função para verificar se usuário pertence à empresa
CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id
      AND company_id = _company_id
      AND status = 'active'
  )
$$;

-- Função para verificar se usuário é admin da empresa
CREATE OR REPLACE FUNCTION public.is_company_admin(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id
      AND company_id = _company_id
      AND system_role = 'admin'
      AND status = 'active'
  )
$$;

-- Função para verificar status must_change_password
CREATE OR REPLACE FUNCTION public.user_must_change_password(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(must_change_password, false)
  FROM public.profiles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- 6. TRIGGER PARA VALIDAR COMPANY_ID EM NOVOS REGISTROS

-- Função para gerar senha temporária
CREATE OR REPLACE FUNCTION public.generate_temp_password()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN 'Temp' || substr(md5(random()::text), 1, 8) || '!';
END;
$$;

-- 7. ATUALIZAR RLS POLICIES PARA COMPANIES

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage companies" ON public.companies;
DROP POLICY IF EXISTS "Company members can view their company" ON public.companies;

-- Apenas SYSTEM_ADMIN pode gerenciar empresas
CREATE POLICY "System admins can manage companies"
ON public.companies
FOR ALL
USING (public.is_system_admin(auth.uid()))
WITH CHECK (public.is_system_admin(auth.uid()));

-- Usuários podem ver sua própria empresa
CREATE POLICY "Users can view their company"
ON public.companies
FOR SELECT
USING (
  id = public.get_user_company_id(auth.uid())
  OR public.is_system_admin(auth.uid())
);

-- 8. ATUALIZAR RLS POLICIES PARA PROFILES

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- SYSTEM_ADMIN pode gerenciar todos os profiles
CREATE POLICY "System admins can manage all profiles"
ON public.profiles
FOR ALL
USING (public.is_system_admin(auth.uid()))
WITH CHECK (public.is_system_admin(auth.uid()));

-- Admin da empresa pode ver e gerenciar usuários da sua empresa
CREATE POLICY "Company admins can manage company users"
ON public.profiles
FOR ALL
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND public.is_company_admin(auth.uid(), company_id)
)
WITH CHECK (
  company_id = public.get_user_company_id(auth.uid())
  AND public.is_company_admin(auth.uid(), company_id)
);

-- Usuários podem ver outros usuários da mesma empresa
CREATE POLICY "Users can view company profiles"
ON public.profiles
FOR SELECT
USING (
  company_id = public.get_user_company_id(auth.uid())
  OR user_id = auth.uid()
);

-- Usuários podem atualizar próprio perfil (exceto campos restritos)
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 9. ATUALIZAR RLS PARA PROJECTS (ISOLAMENTO POR EMPRESA)

-- Drop existing policies on projects
DROP POLICY IF EXISTS "Anyone can create projects" ON public.projects;
DROP POLICY IF EXISTS "Anyone can delete projects" ON public.projects;
DROP POLICY IF EXISTS "Anyone can update projects" ON public.projects;
DROP POLICY IF EXISTS "Anyone can view projects" ON public.projects;

-- Habilitar RLS se não estiver habilitado
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Usuários só veem projetos da sua empresa
CREATE POLICY "Users can view company projects"
ON public.projects
FOR SELECT
USING (
  company_id = public.get_user_company_id(auth.uid())
  OR public.is_system_admin(auth.uid())
);

-- Apenas admins/editors podem criar projetos
CREATE POLICY "Editors can create company projects"
ON public.projects
FOR INSERT
WITH CHECK (
  company_id = public.get_user_company_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND system_role IN ('admin', 'user')
    AND status = 'active'
  )
);

-- Apenas admins/editors podem atualizar projetos da empresa
CREATE POLICY "Editors can update company projects"
ON public.projects
FOR UPDATE
USING (
  company_id = public.get_user_company_id(auth.uid())
)
WITH CHECK (
  company_id = public.get_user_company_id(auth.uid())
);

-- Apenas admins podem deletar projetos
CREATE POLICY "Admins can delete company projects"
ON public.projects
FOR DELETE
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND public.is_company_admin(auth.uid(), company_id)
);

-- 10. CRIAR ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_system_role ON public.profiles(system_role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_projects_company_id ON public.projects(company_id);
CREATE INDEX IF NOT EXISTS idx_companies_slug ON public.companies(slug);