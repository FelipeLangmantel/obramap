-- ============================================================
-- MENU-5: Tipos de Contrato por empresa
-- ============================================================
CREATE TABLE IF NOT EXISTS public.company_contract_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cct_company ON public.company_contract_types(company_id) WHERE ativo;

ALTER TABLE public.company_contract_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cct_select" ON public.company_contract_types;
CREATE POLICY "cct_select" ON public.company_contract_types
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "cct_insert" ON public.company_contract_types;
CREATE POLICY "cct_insert" ON public.company_contract_types
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "cct_update" ON public.company_contract_types;
CREATE POLICY "cct_update" ON public.company_contract_types
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "cct_delete" ON public.company_contract_types;
CREATE POLICY "cct_delete" ON public.company_contract_types
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());

-- Tipos default para empresas existentes (apenas onde ainda não há)
INSERT INTO public.company_contract_types (company_id, nome)
SELECT c.id, t.nome
FROM public.companies c
CROSS JOIN (VALUES
  ('Moradia Popular (MCMV)'),
  ('Alto Padrão'),
  ('Loteamento'),
  ('Comercial'),
  ('Industrial')
) AS t(nome)
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_contract_types x
  WHERE x.company_id = c.id
);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_cct_updated_at ON public.company_contract_types;
CREATE TRIGGER trg_cct_updated_at
BEFORE UPDATE ON public.company_contract_types
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- MENU-3: Garantir colunas extras em companies (CNPJ, endereço)
-- ============================================================
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS razao_social TEXT,
  ADD COLUMN IF NOT EXISTS nome_fantasia TEXT,
  ADD COLUMN IF NOT EXISTS endereco_rua TEXT,
  ADD COLUMN IF NOT EXISTS endereco_numero TEXT,
  ADD COLUMN IF NOT EXISTS endereco_cidade TEXT,
  ADD COLUMN IF NOT EXISTS endereco_estado TEXT,
  ADD COLUMN IF NOT EXISTS endereco_cep TEXT,
  ADD COLUMN IF NOT EXISTS telefone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT;

-- ============================================================
-- MENU-6: Notificações isoladas por usuário
-- Adiciona user_id (nullable para preservar legacy broadcast)
-- ============================================================
ALTER TABLE public.system_notifications
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sysnotif_user ON public.system_notifications(user_id) WHERE user_id IS NOT NULL;

-- Atualizar RLS: usuário vê suas próprias OU broadcast da sua empresa (user_id null)
DROP POLICY IF EXISTS "notifications_own" ON public.system_notifications;
DROP POLICY IF EXISTS "system_notifications_select" ON public.system_notifications;
DROP POLICY IF EXISTS "system_notifications_company_select" ON public.system_notifications;

CREATE POLICY "system_notifications_user_select" ON public.system_notifications
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS "system_notifications_user_update" ON public.system_notifications;
CREATE POLICY "system_notifications_user_update" ON public.system_notifications
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (user_id IS NULL OR user_id = auth.uid())
  );