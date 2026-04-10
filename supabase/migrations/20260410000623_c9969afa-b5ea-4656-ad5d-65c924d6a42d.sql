-- 1. Trigger: when NF is received, convert prevista → real and generate notification
CREATE OR REPLACE FUNCTION public.fn_despesa_on_nf_recebida()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company_id UUID;
  v_obra_nome  TEXT;
  v_num_med    TEXT;
BEGIN
  IF NEW.status_nf = 'recebido' AND (OLD.status_nf IS DISTINCT FROM 'recebido') THEN
    UPDATE despesas_mensais
      SET tipo_despesa = 'real'
    WHERE medicao_id = NEW.id
      AND tipo_despesa = 'prevista';

    SELECT op.company_id, op.nome INTO v_company_id, v_obra_nome
      FROM obras_portfolio op WHERE op.id = NEW.obra_id;
    v_num_med := COALESCE(NEW.num_medicao, '—');

    IF EXISTS (
      SELECT 1 FROM despesas_mensais
      WHERE medicao_id = NEW.id AND tipo_despesa = 'real' AND status != 'fechado'
    ) THEN
      INSERT INTO system_notifications (company_id, obra_id, medicao_id, tipo, titulo, mensagem)
      SELECT v_company_id, NEW.obra_id, NEW.id,
        'despesa_fechamento',
        format('Medição %s paga — feche a despesa', v_num_med),
        format('A medição %s da obra "%s" foi paga. Acesse a aba Despesas e faça o fechamento.',
          v_num_med, COALESCE(v_obra_nome, '—'))
      WHERE v_company_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM system_notifications
          WHERE medicao_id = NEW.id AND tipo = 'despesa_fechamento' AND resolvida = false
        );
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_despesa_on_nf_recebida ON public.medicoes_ple;
CREATE TRIGGER trg_despesa_on_nf_recebida
  AFTER UPDATE OF status_nf ON public.medicoes_ple
  FOR EACH ROW EXECUTE FUNCTION public.fn_despesa_on_nf_recebida();

-- 2. Trigger: when measurement is approved, convert prevista → real
CREATE OR REPLACE FUNCTION public.fn_despesa_on_aprovacao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status_medicao = 'aprovada' AND OLD.status_medicao != 'aprovada' THEN
    UPDATE despesas_mensais SET tipo_despesa = 'real'
    WHERE medicao_id = NEW.id AND tipo_despesa = 'prevista';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_despesa_on_aprovacao ON public.medicoes_ple;
CREATE TRIGGER trg_despesa_on_aprovacao
  AFTER UPDATE OF status_medicao ON public.medicoes_ple
  FOR EACH ROW EXECUTE FUNCTION public.fn_despesa_on_aprovacao();

-- 3. Replace broad FOR ALL policy with SELECT-only
DROP POLICY IF EXISTS "despesas_mensais_company" ON public.despesas_mensais;
CREATE POLICY "despesas_mensais_select" ON public.despesas_mensais
  FOR SELECT TO authenticated
  USING (obra_id IN (SELECT id FROM obras_portfolio WHERE company_id = get_my_company_id()));

-- 4. Backfill: prevista expenses linked to approved measurements → real
UPDATE despesas_mensais d
  SET tipo_despesa = 'real'
  FROM medicoes_ple m
  WHERE d.medicao_id = m.id
    AND m.status_medicao = 'aprovada'
    AND d.tipo_despesa = 'prevista';