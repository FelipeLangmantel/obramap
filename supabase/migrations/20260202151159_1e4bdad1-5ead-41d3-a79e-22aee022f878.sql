-- Tabela para governança global de módulos do sistema
CREATE TABLE public.system_modules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  is_beta BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.system_modules ENABLE ROW LEVEL SECURITY;

-- Policy: Qualquer usuário autenticado pode ler
CREATE POLICY "Authenticated users can read system_modules"
ON public.system_modules
FOR SELECT
TO authenticated
USING (true);

-- Policy: Apenas system_admin pode modificar (via RPC abaixo)
-- Por segurança, bloqueamos INSERT/UPDATE/DELETE direto

-- Função para verificar se usuário é system_admin
CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND is_system_admin = true
  );
END;
$$;

-- Policy: System Admin pode modificar
CREATE POLICY "System admin can manage system_modules"
ON public.system_modules
FOR ALL
TO authenticated
USING (public.is_system_admin())
WITH CHECK (public.is_system_admin());

-- Trigger para atualizar updated_at
CREATE TRIGGER update_system_modules_updated_at
BEFORE UPDATE ON public.system_modules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Popular com módulos existentes do sistema
INSERT INTO public.system_modules (key, name, description, display_order, is_enabled, is_beta) VALUES
  ('map', 'Mapa de Obras', 'Visualização do progresso das casas em grid', 1, true, false),
  ('interactive-map', 'Mapa Interativo', 'Mapa com imagem de fundo posicionável', 2, true, false),
  ('3d-map', 'Mapa 3D', 'Visualização tridimensional do empreendimento', 3, true, true),
  ('charts', 'Gráficos', 'Análises e métricas visuais', 4, true, false),
  ('production', 'Produção Semanal', 'Controle de produção executada por semana', 5, true, false),
  ('planning', 'Planejamento', 'Planejamento de produção semanal', 6, true, false),
  ('measurement-planning', 'Planejamento de Medição', 'Planejamento quinzenal tático por medição', 7, true, false),
  ('long-term-planning', 'Planejamento de Longo Prazo', 'Planejamento estratégico de todas as quinzenas', 8, true, false),
  ('project-contract', 'Contrato da Obra', 'Gestão do contrato e metas de receita', 9, true, false),
  ('costs', 'Custos da Obra', 'Orçamento e custos por serviço', 10, true, false),
  ('supplies', 'Suprimentos', 'Gestão JIT de materiais e alertas de compra', 11, true, false),
  ('financial-flow', 'Fluxo Financeiro', 'Controle de entradas e saídas financeiras', 12, true, false),
  ('board-decisions', 'Painel da Diretoria', 'Decisões executivas e governança', 13, true, true),
  ('delivery', 'Entrega & Pós-Obra', 'Checklist de entrega e gestão de pendências', 14, true, false),
  ('smart-planning', 'Planejamento Inteligente', 'Linha de balanço e Gantt automatizados', 15, true, true),
  ('inputs', 'Cadastro de Insumos', 'Gestão de materiais e insumos', 16, true, false),
  ('suppliers', 'Cadastro de Fornecedores', 'Gestão de fornecedores', 17, true, false)
ON CONFLICT (key) DO NOTHING;