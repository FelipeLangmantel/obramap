
-- ═══════════════════════════════════════════════════════════════
-- PROMPT 1 — BLOCO 1: Validation trigger for valor_acatado <= valor_medicao
-- Using trigger instead of CHECK constraint for safety
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_validate_medicao_values()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.valor_medicao IS NOT NULL AND NEW.valor_medicao < 0 THEN
    RAISE EXCEPTION 'valor_medicao cannot be negative';
  END IF;
  IF NEW.valor_previsto_medicao IS NOT NULL AND NEW.valor_previsto_medicao < 0 THEN
    RAISE EXCEPTION 'valor_previsto_medicao cannot be negative';
  END IF;
  IF NEW.valor_acatado IS NOT NULL AND NEW.valor_medicao IS NOT NULL
     AND NEW.valor_acatado > (NEW.valor_medicao * 1.001) THEN
    RAISE EXCEPTION 'valor_acatado cannot exceed valor_medicao';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_medicao_values ON public.medicoes_ple;
CREATE TRIGGER trg_validate_medicao_values
  BEFORE INSERT OR UPDATE ON public.medicoes_ple
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_medicao_values();

-- ═══════════════════════════════════════════════════════════════
-- PROMPT 1 — BLOCO 2: Validation trigger for despesas_mensais
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_validate_despesa_valor()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.valor < 0 THEN
    RAISE EXCEPTION 'despesa valor cannot be negative';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_despesa_valor ON public.despesas_mensais;
CREATE TRIGGER trg_validate_despesa_valor
  BEFORE INSERT OR UPDATE ON public.despesas_mensais
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_despesa_valor();

-- ═══════════════════════════════════════════════════════════════
-- PROMPT 1 — BLOCO 2b: Validation trigger for aditivos_contratos
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_validate_aditivo_valores()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.aditivo_valor < 0 THEN
    RAISE EXCEPTION 'aditivo_valor cannot be negative';
  END IF;
  IF NEW.supressao_valor < 0 THEN
    RAISE EXCEPTION 'supressao_valor cannot be negative';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_aditivo_valores ON public.aditivos_contratos;
CREATE TRIGGER trg_validate_aditivo_valores
  BEFORE INSERT OR UPDATE ON public.aditivos_contratos
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_aditivo_valores();

-- ═══════════════════════════════════════════════════════════════
-- PROMPT 1 — BLOCO 3: Revoke DELETE and UPDATE on audit log
-- ═══════════════════════════════════════════════════════════════
REVOKE DELETE ON public.holding_audit_log FROM authenticated;
REVOKE UPDATE ON public.holding_audit_log FROM authenticated;

-- ═══════════════════════════════════════════════════════════════
-- PROMPT 1 — BLOCO 4: updated_at on obras_portfolio
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.obras_portfolio
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_obras_updated_at ON public.obras_portfolio;
CREATE TRIGGER trg_obras_updated_at
  BEFORE UPDATE ON public.obras_portfolio
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════
-- PROMPT 2 — BLOCO 1: Clean duplicate system_notifications policies
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "notifications_own_company" ON public.system_notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.system_notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.system_notifications;
DROP POLICY IF EXISTS "notif_company_read" ON public.system_notifications;
DROP POLICY IF EXISTS "notif_company_update" ON public.system_notifications;
DROP POLICY IF EXISTS "notif_company_insert" ON public.system_notifications;

CREATE POLICY "notif_select" ON public.system_notifications
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "notif_insert" ON public.system_notifications
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "notif_update" ON public.system_notifications
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id());

-- ═══════════════════════════════════════════════════════════════
-- PROMPT 2 — BLOCO 2: Fix despesa_edit_requests policies
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "despesa_edit_requests_company" ON public.despesa_edit_requests;
DROP POLICY IF EXISTS "despesa_edit_req_company" ON public.despesa_edit_requests;

CREATE POLICY "despesa_edit_req_select" ON public.despesa_edit_requests
  FOR SELECT TO authenticated
  USING (obra_id IN (
    SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id()
  ));

CREATE POLICY "despesa_edit_req_insert" ON public.despesa_edit_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND obra_id IN (
      SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id()
    )
  );

CREATE POLICY "despesa_edit_req_update" ON public.despesa_edit_requests
  FOR UPDATE TO authenticated
  USING (obra_id IN (
    SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id()
  ));

-- ═══════════════════════════════════════════════════════════════
-- PROMPT 2 — BLOCO 3: Fix medicao_correction_requests policies
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users can view correction requests for their company obras"
  ON public.medicao_correction_requests;

CREATE POLICY "correction_req_select" ON public.medicao_correction_requests
  FOR SELECT TO authenticated
  USING (obra_id IN (
    SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id()
  ));

DROP POLICY IF EXISTS "Authenticated users can create correction requests"
  ON public.medicao_correction_requests;

CREATE POLICY "correction_req_insert" ON public.medicao_correction_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND obra_id IN (
      SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id()
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- PROMPT 2 — BLOCO 4: aditivos_contratos and pendencias_projeto
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "aditivos_contratos_company" ON public.aditivos_contratos;

CREATE POLICY "aditivos_select" ON public.aditivos_contratos
  FOR SELECT TO authenticated
  USING (obra_id IN (SELECT id FROM obras_portfolio WHERE company_id = get_my_company_id()));

CREATE POLICY "aditivos_write" ON public.aditivos_contratos
  FOR ALL TO authenticated
  USING (can_write() AND obra_id IN (SELECT id FROM obras_portfolio WHERE company_id = get_my_company_id()))
  WITH CHECK (can_write() AND obra_id IN (SELECT id FROM obras_portfolio WHERE company_id = get_my_company_id()));

DROP POLICY IF EXISTS "pendencias_projeto_company" ON public.pendencias_projeto;

CREATE POLICY "pendencias_select" ON public.pendencias_projeto
  FOR SELECT TO authenticated
  USING (obra_id IN (SELECT id FROM obras_portfolio WHERE company_id = get_my_company_id()));

CREATE POLICY "pendencias_write" ON public.pendencias_projeto
  FOR ALL TO authenticated
  USING (can_write() AND obra_id IN (SELECT id FROM obras_portfolio WHERE company_id = get_my_company_id()))
  WITH CHECK (can_write() AND obra_id IN (SELECT id FROM obras_portfolio WHERE company_id = get_my_company_id()));

-- ═══════════════════════════════════════════════════════════════
-- PROMPT 2 — BLOCO 5: holding_doc_files DELETE for admins
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users can delete their own doc files" ON public.holding_doc_files;

CREATE POLICY "doc_files_delete" ON public.holding_doc_files
  FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid()
      AND system_role IN ('admin', 'system_admin')
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- PROMPT 3 — BLOCO 1: Protect is_locked via RLS
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "writers_despesas_update" ON public.despesas_mensais;

CREATE POLICY "writers_despesas_update" ON public.despesas_mensais
  FOR UPDATE TO authenticated
  USING (
    public.can_write()
    AND obra_id IN (
      SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id()
    )
    AND (
      is_locked = false
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = auth.uid()
        AND system_role IN ('admin', 'system_admin')
      )
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- PROMPT 3 — BLOCO 2: RPC recalcular_percentual_financeiro
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.recalcular_percentual_financeiro(
  p_obra_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valor_contrato     NUMERIC;
  v_aditivo_total      NUMERIC;
  v_valor_medido_ini   NUMERIC;
  v_total_aprovado     NUMERIC;
  v_total_financeiro   NUMERIC;
  v_percentual         NUMERIC;
BEGIN
  SELECT
    COALESCE(valor_contrato, 0),
    COALESCE(aditivo_valor_total, 0),
    COALESCE(valor_medido_inicial, 0)
  INTO v_valor_contrato, v_aditivo_total, v_valor_medido_ini
  FROM obras_portfolio
  WHERE id = p_obra_id
  FOR UPDATE;

  IF (v_valor_contrato + v_aditivo_total) <= 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(COALESCE(valor_acatado, valor_medicao)), 0)
  INTO v_total_aprovado
  FROM medicoes_ple
  WHERE obra_id = p_obra_id
    AND status_medicao = 'aprovada'
    AND num_medicao != 'Saldo Inicial';

  v_total_financeiro := v_total_aprovado + v_valor_medido_ini;
  v_percentual := LEAST(100,
    ROUND((v_total_financeiro / (v_valor_contrato + v_aditivo_total)) * 100, 1)
  );

  UPDATE obras_portfolio
  SET percentual_financeiro = v_percentual
  WHERE id = p_obra_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalcular_percentual_financeiro(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- PROMPT 3 — BLOCO 3: Storage bucket policy fix
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Authenticated users can upload holding docs" ON storage.objects;

CREATE POLICY "company_upload_holding_docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'holding-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.obras_portfolio
      WHERE company_id = public.get_my_company_id()
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- PROMPT 5 — BLOCO 1: data_envio_nf column
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.medicoes_ple
  ADD COLUMN IF NOT EXISTS data_envio_nf DATE;

-- ═══════════════════════════════════════════════════════════════
-- PROMPT 5 — BLOCO 2: restricoes_financeiras table
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.restricoes_financeiras (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id          UUID NOT NULL REFERENCES public.obras_portfolio(id) ON DELETE CASCADE,
  medicao_id       UUID REFERENCES public.medicoes_ple(id) ON DELETE SET NULL,
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo             TEXT NOT NULL,
  descricao        TEXT NOT NULL,
  valor            NUMERIC NOT NULL DEFAULT 0,
  impacto_medicao  NUMERIC NOT NULL DEFAULT 0,
  data_limite      DATE NOT NULL,
  resolvida        BOOLEAN NOT NULL DEFAULT false,
  resolvida_em     TIMESTAMPTZ,
  resolvida_por    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolvida_por_nome TEXT,
  valor_pago       NUMERIC DEFAULT 0,
  forma_resolucao  TEXT,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Validation trigger for restricoes_financeiras
CREATE OR REPLACE FUNCTION public.fn_validate_restricao()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tipo NOT IN ('material', 'mao_de_obra', 'administrativa') THEN
    RAISE EXCEPTION 'tipo must be material, mao_de_obra, or administrativa';
  END IF;
  IF NEW.valor < 0 THEN
    RAISE EXCEPTION 'valor cannot be negative';
  END IF;
  IF NEW.impacto_medicao < 0 THEN
    RAISE EXCEPTION 'impacto_medicao cannot be negative';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_restricao ON public.restricoes_financeiras;
CREATE TRIGGER trg_validate_restricao
  BEFORE INSERT OR UPDATE ON public.restricoes_financeiras
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_restricao();

ALTER TABLE public.restricoes_financeiras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restricoes_select" ON public.restricoes_financeiras
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "restricoes_insert" ON public.restricoes_financeiras
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write()
    AND company_id = public.get_my_company_id()
  );

CREATE POLICY "restricoes_update" ON public.restricoes_financeiras
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      resolvida = false
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = auth.uid()
        AND system_role IN ('admin', 'system_admin')
      )
    )
  );

CREATE POLICY "restricoes_delete" ON public.restricoes_financeiras
  FOR DELETE TO authenticated
  USING (
    public.can_write()
    AND company_id = public.get_my_company_id()
    AND resolvida = false
  );

CREATE INDEX IF NOT EXISTS idx_restricoes_obra ON public.restricoes_financeiras(obra_id, resolvida);
CREATE INDEX IF NOT EXISTS idx_restricoes_medicao ON public.restricoes_financeiras(medicao_id) WHERE medicao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_restricoes_company ON public.restricoes_financeiras(company_id, resolvida, data_limite);

DROP TRIGGER IF EXISTS trg_restricoes_updated_at ON public.restricoes_financeiras;
CREATE TRIGGER trg_restricoes_updated_at
  BEFORE UPDATE ON public.restricoes_financeiras
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Notification trigger for new restrictions
CREATE OR REPLACE FUNCTION public.fn_notificar_restricao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome_obra TEXT;
BEGIN
  SELECT nome INTO v_nome_obra FROM obras_portfolio WHERE id = NEW.obra_id;
  INSERT INTO system_notifications (company_id, obra_id, tipo, titulo, mensagem)
  VALUES (
    NEW.company_id,
    NEW.obra_id,
    'restricao_financeira',
    format('Restrição financeira — %s', v_nome_obra),
    format('Nova restrição (%s): %s — Impacto na medição: R$ %s. Prazo: %s.',
      NEW.tipo, NEW.descricao,
      to_char(NEW.impacto_medicao, 'FM999G999G990D00'),
      to_char(NEW.data_limite, 'DD/MM/YYYY')
    )
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notificar_restricao ON public.restricoes_financeiras;
CREATE TRIGGER trg_notificar_restricao
  AFTER INSERT ON public.restricoes_financeiras
  FOR EACH ROW EXECUTE FUNCTION public.fn_notificar_restricao();

GRANT ALL ON public.restricoes_financeiras TO authenticated;

-- Update existing obras_portfolio rows that have NULL updated_at
DO $$
BEGIN
  UPDATE public.obras_portfolio SET updated_at = created_at WHERE updated_at IS NULL;
END; $$;
