
-- Catálogo de tipos de evento
CREATE TABLE public.notification_event_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL UNIQUE,
  modulo TEXT NOT NULL,
  label TEXT NOT NULL,
  descricao TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_event_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users view event types"
  ON public.notification_event_types FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "System admins manage event types"
  ON public.notification_event_types FOR ALL
  TO authenticated
  USING (public.is_system_admin(auth.uid()))
  WITH CHECK (public.is_system_admin(auth.uid()));

INSERT INTO public.notification_event_types (tipo, modulo, label, descricao, display_order) VALUES
  ('medicao_previsao_vencida', 'holding', 'Medição com previsão vencida', 'Quando a data prevista de uma medição passa sem lançamento', 10),
  ('obra_sem_medicao_no_periodo', 'holding', 'Obra sem medição no período', 'Quando uma obra fica um período sem registrar medição', 20),
  ('desvio_financeiro_relevante', 'holding', 'Desvio financeiro relevante', 'Quando o desvio entre previsto e realizado ultrapassa o limite', 30),
  ('prazo_obra_avencer', 'holding', 'Prazo da obra a vencer', 'Quando o prazo contratual da obra está próximo do fim', 40),
  ('prazo_obra_vencido', 'holding', 'Prazo da obra vencido', 'Quando o prazo contratual da obra é ultrapassado', 50),
  ('rdo_solicitacao_edicao', 'diario', 'Solicitação de edição de RDO', 'Engenheiro solicita edição de um RDO já finalizado', 60),
  ('rdo_aprovado', 'diario', 'RDO aprovado', 'Coordenador aprova/finaliza um RDO', 70),
  ('rdo_reprovado', 'diario', 'RDO reprovado', 'Coordenador reprova um RDO', 75),
  ('medicao_pendente_aprovacao', 'ple', 'Medição PLE pendente de aprovação', 'Nova medição PLE aguardando aprovação', 80),
  ('compra_liberada', 'compras', 'Compra liberada para execução', 'Suprimento aprovado e liberado para compra', 90),
  ('documento_vencendo', 'holding', 'Documento da obra vencendo', 'Documento contratual próximo da data de validade', 100)
ON CONFLICT (tipo) DO NOTHING;

-- Regras configuráveis
CREATE TABLE public.notification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  event_type TEXT NOT NULL REFERENCES public.notification_event_types(tipo) ON UPDATE CASCADE,
  target_user_ids UUID[] NOT NULL DEFAULT '{}',
  target_department_names TEXT[] NOT NULL DEFAULT '{}',
  scope TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'specific')),
  scope_obra_ids UUID[] NOT NULL DEFAULT '{}',
  channel_inapp BOOLEAN NOT NULL DEFAULT true,
  channel_email BOOLEAN NOT NULL DEFAULT false,
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_rules_company ON public.notification_rules(company_id);
CREATE INDEX idx_notif_rules_event ON public.notification_rules(event_type) WHERE ativa = true;

ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins view rules"
  ON public.notification_rules FOR SELECT
  TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (public.is_company_admin(auth.uid(), company_id) OR public.is_system_admin(auth.uid()))
  );

CREATE POLICY "Company admins create rules"
  ON public.notification_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (public.is_company_admin(auth.uid(), company_id) OR public.is_system_admin(auth.uid()))
  );

CREATE POLICY "Company admins update rules"
  ON public.notification_rules FOR UPDATE
  TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (public.is_company_admin(auth.uid(), company_id) OR public.is_system_admin(auth.uid()))
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (public.is_company_admin(auth.uid(), company_id) OR public.is_system_admin(auth.uid()))
  );

CREATE POLICY "Company admins delete rules"
  ON public.notification_rules FOR DELETE
  TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (public.is_company_admin(auth.uid(), company_id) OR public.is_system_admin(auth.uid()))
  );

CREATE TRIGGER trg_notification_rules_updated_at
  BEFORE UPDATE ON public.notification_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Resolve destinatários
CREATE OR REPLACE FUNCTION public.resolve_notification_recipients(
  _event_type TEXT,
  _company_id UUID,
  _obra_id UUID DEFAULT NULL
)
RETURNS TABLE(user_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rule RECORD;
  recipients UUID[] := '{}';
  dept_users UUID[];
BEGIN
  FOR rule IN
    SELECT * FROM public.notification_rules
    WHERE company_id = _company_id
      AND event_type = _event_type
      AND ativa = true
  LOOP
    IF rule.scope = 'specific' AND _obra_id IS NOT NULL
       AND NOT (_obra_id = ANY(rule.scope_obra_ids)) THEN
      CONTINUE;
    END IF;

    IF array_length(rule.target_user_ids, 1) > 0 THEN
      recipients := recipients || rule.target_user_ids;
    END IF;

    -- Departamentos: usa allowed_project_ids como heurística — usuários da empresa
    -- cujo perfil contenha o departamento serão expandidos via UI quando vincularmos
    -- usuários a departamentos. Por ora, a expansão por nome de depto fica reservada
    -- para integração futura (placeholder).
  END LOOP;

  RETURN QUERY
    SELECT DISTINCT u FROM unnest(recipients) AS u WHERE u IS NOT NULL;
END;
$$;
