
-- Enums
CREATE TYPE public.obra_status AS ENUM ('em_andamento','nao_iniciada','concluida','paralisada');
CREATE TYPE public.medicao_status AS ENUM ('aprovada','enviada','pendente','nao_iniciada');
CREATE TYPE public.nf_status AS ENUM ('recebido','aguardando_aprovacao','pendente');
CREATE TYPE public.aditivo_status AS ENUM ('aprovado','pendente');
CREATE TYPE public.despesa_status AS ENUM ('fechado','em_fechamento','nao_iniciado');

-- 1. obras_portfolio
CREATE TABLE public.obras_portfolio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  empresa TEXT,
  num_contrato TEXT,
  parceria_scp TEXT,
  valor_contrato NUMERIC NOT NULL DEFAULT 0,
  data_inicio DATE,
  prazo_dias INTEGER NOT NULL DEFAULT 0,
  aditivo_prazo_dias INTEGER NOT NULL DEFAULT 0,
  status obra_status NOT NULL DEFAULT 'nao_iniciada',
  percentual_andamento NUMERIC NOT NULL DEFAULT 0,
  periodo_medicao TEXT,
  prazo_pagamento TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.obras_portfolio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obras_portfolio_company" ON public.obras_portfolio
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

-- 2. documentos_obra
CREATE TABLE public.documentos_obra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES public.obras_portfolio(id) ON DELETE CASCADE,
  ata BOOLEAN NOT NULL DEFAULT false,
  ois BOOLEAN NOT NULL DEFAULT false,
  art BOOLEAN NOT NULL DEFAULT false,
  cno BOOLEAN NOT NULL DEFAULT false,
  impl BOOLEAN NOT NULL DEFAULT false,
  scp BOOLEAN NOT NULL DEFAULT false,
  sondagem_spt BOOLEAN NOT NULL DEFAULT false,
  planta_localizacao BOOLEAN NOT NULL DEFAULT false,
  plano_altimetrico BOOLEAN NOT NULL DEFAULT false,
  painel_bordo BOOLEAN NOT NULL DEFAULT false,
  checklist_seguranca BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE public.documentos_obra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documentos_obra_company" ON public.documentos_obra
  FOR ALL TO authenticated
  USING (obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id()))
  WITH CHECK (obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id()));

-- 3. medicoes_ple
CREATE TABLE public.medicoes_ple (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES public.obras_portfolio(id) ON DELETE CASCADE,
  num_medicao TEXT,
  mes_referencia TEXT,
  ano_referencia INTEGER,
  data_envio DATE,
  data_aprovacao DATE,
  status_medicao medicao_status NOT NULL DEFAULT 'nao_iniciada',
  valor_medicao NUMERIC NOT NULL DEFAULT 0,
  num_nf TEXT,
  data_pagamento DATE,
  status_nf nf_status NOT NULL DEFAULT 'pendente'
);
ALTER TABLE public.medicoes_ple ENABLE ROW LEVEL SECURITY;
CREATE POLICY "medicoes_ple_company" ON public.medicoes_ple
  FOR ALL TO authenticated
  USING (obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id()))
  WITH CHECK (obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id()));

-- 4. aditivos_contratos
CREATE TABLE public.aditivos_contratos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES public.obras_portfolio(id) ON DELETE CASCADE,
  num_aditivo TEXT,
  aditivo_prazo_dias INTEGER NOT NULL DEFAULT 0,
  aditivo_valor NUMERIC NOT NULL DEFAULT 0,
  supressao_valor NUMERIC NOT NULL DEFAULT 0,
  data DATE,
  status aditivo_status NOT NULL DEFAULT 'pendente'
);
ALTER TABLE public.aditivos_contratos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aditivos_contratos_company" ON public.aditivos_contratos
  FOR ALL TO authenticated
  USING (obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id()))
  WITH CHECK (obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id()));

-- 5. despesas_mensais
CREATE TABLE public.despesas_mensais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES public.obras_portfolio(id) ON DELETE CASCADE,
  mes_referencia TEXT,
  ano_referencia INTEGER,
  valor NUMERIC NOT NULL DEFAULT 0,
  status despesa_status NOT NULL DEFAULT 'nao_iniciado'
);
ALTER TABLE public.despesas_mensais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "despesas_mensais_company" ON public.despesas_mensais
  FOR ALL TO authenticated
  USING (obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id()))
  WITH CHECK (obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id()));

-- 6. pendencias_projeto
CREATE TABLE public.pendencias_projeto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES public.obras_portfolio(id) ON DELETE CASCADE,
  tipo TEXT,
  descricao TEXT,
  concluido BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE public.pendencias_projeto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pendencias_projeto_company" ON public.pendencias_projeto
  FOR ALL TO authenticated
  USING (obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id()))
  WITH CHECK (obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id()));
