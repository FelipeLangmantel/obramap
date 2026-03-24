-- TABLE 1: Empresas da Holding (cadastro centralizado)
CREATE TABLE public.holding_empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cnpj TEXT,
  responsavel TEXT,
  telefone TEXT,
  email TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.holding_empresas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "holding_empresas_company" ON public.holding_empresas
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

-- TABLE 2: Tipos de documento configuráveis
CREATE TABLE public.holding_doc_tipos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'doc_obra',
  obrigatorio BOOLEAN NOT NULL DEFAULT true,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.holding_doc_tipos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "holding_doc_tipos_company" ON public.holding_doc_tipos
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

-- TABLE 3: Checklist de documentos por obra (flexível)
CREATE TABLE public.holding_obra_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES public.obras_portfolio(id) ON DELETE CASCADE,
  doc_tipo_id UUID NOT NULL REFERENCES public.holding_doc_tipos(id) ON DELETE CASCADE,
  checked BOOLEAN NOT NULL DEFAULT false,
  data_entrega DATE,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(obra_id, doc_tipo_id)
);
ALTER TABLE public.holding_obra_docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "holding_obra_docs_company" ON public.holding_obra_docs
  FOR ALL TO authenticated
  USING (obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id()))
  WITH CHECK (obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id()));