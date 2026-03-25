
-- 1. Adicionar campos de auditoria em medicoes_ple
ALTER TABLE public.medicoes_ple
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Adicionar campos de auditoria em despesas_mensais
ALTER TABLE public.despesas_mensais
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 3. Adicionar campos de auditoria em aditivos_contratos
ALTER TABLE public.aditivos_contratos
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 4. Criar tabela de log de auditoria da Holding
CREATE TABLE IF NOT EXISTS public.holding_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES public.obras_portfolio(id) ON DELETE CASCADE,
  tabela TEXT NOT NULL,
  registro_id UUID,
  acao TEXT NOT NULL,
  descricao TEXT NOT NULL,
  dados_anteriores JSONB DEFAULT '{}',
  dados_novos JSONB DEFAULT '{}',
  realizado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  realizado_por_nome TEXT NOT NULL DEFAULT 'Sistema',
  realizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.holding_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holding_audit_log_view" ON public.holding_audit_log
  FOR SELECT TO authenticated
  USING (
    obra_id IN (
      SELECT id FROM public.obras_portfolio
      WHERE company_id = public.get_my_company_id()
    )
  );

CREATE POLICY "holding_audit_log_insert" ON public.holding_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    obra_id IN (
      SELECT id FROM public.obras_portfolio
      WHERE company_id = public.get_my_company_id()
    )
  );

CREATE INDEX IF NOT EXISTS idx_holding_audit_obra
  ON public.holding_audit_log(obra_id, realizado_em DESC);

GRANT ALL ON public.holding_audit_log TO authenticated;
