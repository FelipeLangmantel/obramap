-- ================================================================
-- REESTRUTURAÇÃO DO MÓDULO DE DESPESAS
-- Regras: despesa linkada à medição, prevista vs real,
-- bloqueio pós-fechamento, alertas e notificações
-- ================================================================

-- 1. Expandir o ENUM de status da despesa
ALTER TYPE public.despesa_status ADD VALUE IF NOT EXISTS 'prevista';
-- Agora: prevista | nao_iniciado | em_fechamento | fechado

-- 2. Adicionar colunas ao despesas_mensais
ALTER TABLE public.despesas_mensais
  -- Vínculo obrigatório com medição (será obrigatório na UI, não no banco para não quebrar dados existentes)
  ADD COLUMN IF NOT EXISTS medicao_id UUID REFERENCES public.medicoes_ple(id) ON DELETE SET NULL,
  -- Tipo: prevista = projeção antes do acatamento | real = despesa confirmada após acatamento
  ADD COLUMN IF NOT EXISTS tipo_despesa TEXT NOT NULL DEFAULT 'prevista'
    CHECK (tipo_despesa IN ('prevista', 'real')),
  -- Descrição livre
  ADD COLUMN IF NOT EXISTS descricao TEXT,
  -- Categoria da despesa
  ADD COLUMN IF NOT EXISTS categoria TEXT DEFAULT 'geral'
    CHECK (categoria IN ('pessoal', 'material', 'equipamento', 'servico', 'administrativo', 'financeiro', 'geral')),
  -- Controle de bloqueio: fechado bloqueia edição para não-admins
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fechado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fechado_por TEXT,
  -- Alerta de fechamento pendente (7 dias após medição aprovada)
  ADD COLUMN IF NOT EXISTS alerta_fechamento_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS alerta_fechamento_sent BOOLEAN NOT NULL DEFAULT false,
  -- Valor da medição referência (para comparação previsto × real)
  ADD COLUMN IF NOT EXISTS valor_medicao_referencia NUMERIC DEFAULT 0;

-- 3. Índices úteis
CREATE INDEX IF NOT EXISTS idx_despesas_medicao ON public.despesas_mensais(medicao_id);
CREATE INDEX IF NOT EXISTS idx_despesas_tipo ON public.despesas_mensais(tipo_despesa);
CREATE INDEX IF NOT EXISTS idx_despesas_locked ON public.despesas_mensais(is_locked);

-- 4. Atualizar despesas existentes: as que têm status=fechado → is_locked=true
UPDATE public.despesas_mensais
  SET is_locked = true, fechado_em = updated_at
  WHERE status = 'fechado' AND is_locked = false;

-- 5. Tabela de notificações do sistema
CREATE TABLE IF NOT EXISTS public.system_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Target: null = todos os admins | uuid = usuário específico
  target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'despesa_sem_fechamento',   -- medição aprovada há 7+ dias sem despesa fechada
    'despesa_pendente_link',    -- medição aprovada sem despesa vinculada
    'despesa_edicao_solicitada', -- editor solicitou edição de despesa fechada
    'medicao_aprovada_despesa',  -- medição acatada → atualizar despesa
    'despesa_prevista_sem_real'  -- despesa prevista ainda não convertida em real
  )),
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  -- Contexto para navegação direta
  obra_id UUID REFERENCES public.obras_portfolio(id) ON DELETE CASCADE,
  medicao_id UUID REFERENCES public.medicoes_ple(id) ON DELETE CASCADE,
  despesa_id UUID REFERENCES public.despesas_mensais(id) ON DELETE CASCADE,
  -- Controle de leitura
  lida BOOLEAN NOT NULL DEFAULT false,
  lida_em TIMESTAMPTZ,
  -- Status
  resolvida BOOLEAN NOT NULL DEFAULT false,
  resolvida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_own_company" ON public.system_notifications
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (target_user_id IS NULL OR target_user_id = auth.uid())
  );

CREATE POLICY "notifications_insert" ON public.system_notifications
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "notifications_update_own" ON public.system_notifications
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (target_user_id IS NULL OR target_user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_notif_company_unread
  ON public.system_notifications(company_id, lida, created_at DESC)
  WHERE lida = false;

CREATE INDEX IF NOT EXISTS idx_notif_user
  ON public.system_notifications(target_user_id, lida)
  WHERE target_user_id IS NOT NULL;

-- 6. Tabela de solicitações de edição de despesas (similar ao sistema de medições)
CREATE TABLE IF NOT EXISTS public.despesa_edit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  despesa_id UUID NOT NULL REFERENCES public.despesas_mensais(id) ON DELETE CASCADE,
  obra_id UUID NOT NULL REFERENCES public.obras_portfolio(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  solicitado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  solicitado_por_nome TEXT NOT NULL DEFAULT '',
  motivo TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  analisado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  analisado_por_nome TEXT,
  analisado_em TIMESTAMPTZ,
  observacao_admin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.despesa_edit_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "despesa_edit_requests_company" ON public.despesa_edit_requests
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

-- 7. Função: ao aprovar medição, gerar notificação automática de despesa
CREATE OR REPLACE FUNCTION public.fn_notify_despesa_on_medicao_aprovada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_obra_nome TEXT;
  v_despesa_vinculada UUID;
BEGIN
  -- Só dispara quando medição muda para 'aprovada'
  IF NEW.status_medicao = 'aprovada' AND OLD.status_medicao != 'aprovada' THEN

    -- Busca company_id e nome da obra
    SELECT op.company_id, op.nome
    INTO v_company_id, v_obra_nome
    FROM obras_portfolio op
    WHERE op.id = NEW.obra_id;

    -- Verifica se já existe despesa vinculada a esta medição
    SELECT id INTO v_despesa_vinculada
    FROM despesas_mensais
    WHERE medicao_id = NEW.id
    LIMIT 1;

    IF v_despesa_vinculada IS NULL THEN
      -- Não há despesa vinculada → notificar para criar
      INSERT INTO system_notifications (
        company_id, tipo, titulo, mensagem,
        obra_id, medicao_id
      ) VALUES (
        v_company_id,
        'despesa_pendente_link',
        'Medição aprovada sem despesa vinculada',
        format('A medição %s da obra "%s" foi aprovada (R$ %s). Vincule ou crie uma despesa real.',
          COALESCE(NEW.num_medicao, '—'),
          COALESCE(v_obra_nome, '—'),
          to_char(COALESCE(NEW.valor_acatado, NEW.valor_medicao, 0), 'FM999G999G990D00')
        ),
        NEW.obra_id,
        NEW.id
      );
    ELSE
      -- Há despesa vinculada mas pode ser prevista → notificar para confirmar como real
      INSERT INTO system_notifications (
        company_id, tipo, titulo, mensagem,
        obra_id, medicao_id, despesa_id
      ) VALUES (
        v_company_id,
        'medicao_aprovada_despesa',
        'Medição aprovada — confirme a despesa',
        format('A medição %s da obra "%s" foi acatada. Confirme a despesa como REAL e faça o fechamento.',
          COALESCE(NEW.num_medicao, '—'),
          COALESCE(v_obra_nome, '—')
        ),
        NEW.obra_id,
        NEW.id,
        v_despesa_vinculada
      );
    END IF;

    -- Marcar alerta de fechamento para 7 dias a partir de agora
    UPDATE despesas_mensais
    SET alerta_fechamento_at = NOW() + INTERVAL '7 days'
    WHERE medicao_id = NEW.id
      AND status != 'fechado'
      AND alerta_fechamento_at IS NULL;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_despesa_on_medicao_aprovada ON public.medicoes_ple;
CREATE TRIGGER trg_notify_despesa_on_medicao_aprovada
  AFTER UPDATE ON public.medicoes_ple
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_despesa_on_medicao_aprovada();

-- 8. Função: ao fechar despesa, marcar is_locked = true automaticamente
CREATE OR REPLACE FUNCTION public.fn_lock_despesa_on_fechamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'fechado' AND OLD.status != 'fechado' THEN
    NEW.is_locked := true;
    NEW.fechado_em := NOW();
    -- Marcar notificações relacionadas como resolvidas
    UPDATE system_notifications
    SET resolvida = true, resolvida_em = NOW()
    WHERE despesa_id = NEW.id AND resolvida = false;
  END IF;

  IF NEW.status != 'fechado' AND OLD.status = 'fechado' THEN
    NEW.is_locked := false;
    NEW.fechado_em := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_despesa ON public.despesas_mensais;
CREATE TRIGGER trg_lock_despesa
  BEFORE UPDATE ON public.despesas_mensais
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_lock_despesa_on_fechamento();

-- 9. RPC: contar notificações não lidas por empresa/usuário
CREATE OR REPLACE FUNCTION public.get_unread_notifications_count(p_company_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM system_notifications
  WHERE company_id = p_company_id
    AND lida = false
    AND resolvida = false
    AND (target_user_id IS NULL OR target_user_id = auth.uid());
$$;

-- 10. RPC: buscar notificações com paginação
CREATE OR REPLACE FUNCTION public.get_notifications(p_company_id UUID, p_limit INT DEFAULT 20, p_offset INT DEFAULT 0)
RETURNS TABLE (
  id UUID, tipo TEXT, titulo TEXT, mensagem TEXT,
  obra_id UUID, obra_nome TEXT,
  medicao_id UUID, medicao_num TEXT,
  despesa_id UUID,
  lida BOOLEAN, resolvida BOOLEAN, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    n.id, n.tipo, n.titulo, n.mensagem,
    n.obra_id, op.nome as obra_nome,
    n.medicao_id, m.num_medicao as medicao_num,
    n.despesa_id,
    n.lida, n.resolvida, n.created_at
  FROM system_notifications n
  LEFT JOIN obras_portfolio op ON op.id = n.obra_id
  LEFT JOIN medicoes_ple m ON m.id = n.medicao_id
  WHERE n.company_id = p_company_id
    AND n.resolvida = false
    AND (n.target_user_id IS NULL OR n.target_user_id = auth.uid())
  ORDER BY n.lida ASC, n.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- 11. Gerar notificações iniciais para medições aprovadas sem despesa vinculada
-- (para dados já existentes no banco)
DO $$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT m.id, m.obra_id, m.num_medicao, m.valor_acatado, m.valor_medicao,
           op.company_id, op.nome
    FROM medicoes_ple m
    JOIN obras_portfolio op ON op.id = m.obra_id
    WHERE m.status_medicao = 'aprovada'
      AND NOT EXISTS (
        SELECT 1 FROM despesas_mensais d WHERE d.medicao_id = m.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM system_notifications n
        WHERE n.medicao_id = m.id AND n.tipo = 'despesa_pendente_link'
      )
  LOOP
    INSERT INTO system_notifications (
      company_id, tipo, titulo, mensagem, obra_id, medicao_id
    ) VALUES (
      v_rec.company_id,
      'despesa_pendente_link',
      'Medição aprovada sem despesa vinculada',
      format('A medição %s da obra "%s" foi aprovada mas não tem despesa vinculada. Vincule uma despesa para completar o fechamento.',
        COALESCE(v_rec.num_medicao, '—'),
        COALESCE(v_rec.nome, '—')
      ),
      v_rec.obra_id,
      v_rec.id
    );
  END LOOP;
END;
$$;
