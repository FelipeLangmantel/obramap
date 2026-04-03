
-- ═══════════════════════════════════════════════════
-- PART 2: Edit Requests table
-- ═══════════════════════════════════════════════════
CREATE TABLE public.edit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES public.obras_portfolio(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_name TEXT NOT NULL,
  justificativa TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  admin_response TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.edit_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "edit_requests_company" ON public.edit_requests
  FOR ALL TO authenticated
  USING (obra_id IN (SELECT id FROM obras_portfolio WHERE company_id = public.get_my_company_id()));

-- ═══════════════════════════════════════════════════
-- PART 3: User Onboarding table
-- ═══════════════════════════════════════════════════
CREATE TABLE public.user_onboarding (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  seen_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, action_key)
);

ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_own" ON public.user_onboarding
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ═══════════════════════════════════════════════════
-- PART 4: Obra Doc Config table
-- ═══════════════════════════════════════════════════
CREATE TABLE public.obra_doc_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES public.obras_portfolio(id) ON DELETE CASCADE,
  tipo_doc TEXT NOT NULL,
  obrigatorio BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(obra_id, tipo_doc)
);

ALTER TABLE public.obra_doc_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "obra_doc_config_company" ON public.obra_doc_config
  FOR ALL TO authenticated
  USING (obra_id IN (SELECT id FROM obras_portfolio WHERE company_id = public.get_my_company_id()));

-- ═══════════════════════════════════════════════════
-- PART 5: Audit Log table + trigger function
-- ═══════════════════════════════════════════════════
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela TEXT NOT NULL,
  registro_id UUID,
  acao TEXT NOT NULL,
  dados_anteriores JSONB,
  dados_novos JSONB,
  user_id UUID,
  user_name TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_company_read" ON public.audit_log
  FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_log(tabela, registro_id, acao, dados_anteriores, dados_novos, user_id)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END,
    auth.uid()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER audit_obras_portfolio
  AFTER INSERT OR UPDATE OR DELETE ON public.obras_portfolio
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER audit_medicoes_ple
  AFTER INSERT OR UPDATE OR DELETE ON public.medicoes_ple
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER audit_despesas_mensais
  AFTER INSERT OR UPDATE OR DELETE ON public.despesas_mensais
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER audit_holding_doc_files
  AFTER INSERT OR UPDATE OR DELETE ON public.holding_doc_files
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

-- ═══════════════════════════════════════════════════
-- PART 6: Session cleanup function
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cleanup_stale_sessions()
RETURNS void AS $$
BEGIN
  UPDATE public.user_sessions
  SET is_active = false,
      logout_at = now(),
      termination_reason = 'timeout'
  WHERE is_active = true
    AND last_active_at < now() - INTERVAL '2 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable realtime for edit_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.edit_requests;
