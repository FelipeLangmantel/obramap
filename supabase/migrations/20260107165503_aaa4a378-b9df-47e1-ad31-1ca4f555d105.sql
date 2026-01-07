-- Criar tabela de módulos por empresa (company_modules)
CREATE TABLE public.company_modules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  module_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'development', 'disabled')),
  description TEXT,
  expected_benefits TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, module_key)
);

-- Habilitar RLS
ALTER TABLE public.company_modules ENABLE ROW LEVEL SECURITY;

-- Política: SYSTEM_ADMIN pode ver e editar todos
CREATE POLICY "System admins can manage all company modules"
ON public.company_modules
FOR ALL
TO authenticated
USING (public.is_system_admin(auth.uid()))
WITH CHECK (public.is_system_admin(auth.uid()));

-- Política: Usuários da empresa podem apenas visualizar seus módulos
CREATE POLICY "Company users can view their modules"
ON public.company_modules
FOR SELECT
TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()));

-- Trigger para updated_at
CREATE TRIGGER update_company_modules_updated_at
  BEFORE UPDATE ON public.company_modules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Criar função para inicializar módulos padrão de uma empresa
CREATE OR REPLACE FUNCTION public.init_company_modules(target_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Inserir módulos padrão (todos ativos por padrão)
  INSERT INTO public.company_modules (company_id, module_key, module_name, status, description, expected_benefits)
  VALUES
    (target_company_id, 'mapa_obras', 'Mapa de Obras', 'active', 'Visualização geral das obras e unidades', 'Visão macro do empreendimento'),
    (target_company_id, 'planejamento_inteligente', 'Planejamento Inteligente', 'active', 'Cronograma avançado com IA', 'Otimização de prazos e recursos'),
    (target_company_id, 'producao', 'Produção', 'active', 'Acompanhamento de produção semanal', 'Controle detalhado de avanço físico'),
    (target_company_id, 'custos', 'Custos da Obra', 'active', 'Gestão de custos e orçamento', 'Controle financeiro da obra'),
    (target_company_id, 'suprimentos', 'Suprimentos', 'active', 'Gestão de compras e estoque', 'Redução de desperdícios'),
    (target_company_id, 'financeiro', 'Fluxo Financeiro', 'active', 'Fluxo de caixa e pagamentos', 'Controle de contas a pagar'),
    (target_company_id, 'entrega', 'Entrega & Pós-Obra', 'active', 'Vistoria e entrega de unidades', 'Gestão de qualidade na entrega'),
    (target_company_id, 'diretoria', 'Painel da Diretoria', 'active', 'Dashboard executivo', 'Tomada de decisão estratégica')
  ON CONFLICT (company_id, module_key) DO NOTHING;
END;
$$;

-- Inicializar módulos para empresas existentes
DO $$
DECLARE
  company_rec RECORD;
BEGIN
  FOR company_rec IN SELECT id FROM public.companies LOOP
    PERFORM public.init_company_modules(company_rec.id);
  END LOOP;
END;
$$;