-- ═══════════════════════════════════════════════════════════════
-- PRE-FIX: Remove CHECK constraint on tipo to allow new notification types
-- The original constraint only allowed 5 types — new types added today
-- (medicao_previsao_vencida, restricao_financeira) would be rejected
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  -- Find and drop any CHECK constraint on system_notifications.tipo
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.system_notifications'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%tipo%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.system_notifications DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- FIX 1: get_unread_notifications_count incluía notificações resolvidas
-- O contador do sino mostrava número maior que a lista (lista filtra resolvida=false)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_unread_notifications_count(p_company_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer FROM public.system_notifications
  WHERE company_id = p_company_id
    AND lida = false
    AND resolvida = false;
$$;

-- ═══════════════════════════════════════════════════════════════
-- FIX 2: Trigger para criar notificação quando medição fica vencida
-- Dispara ao INSERT ou UPDATE de medicoes_ple quando:
--   data_previsao_medicao < CURRENT_DATE
--   data_envio IS NULL (ainda não enviada)
--   status_medicao IN ('prevista', 'nao_iniciada')
-- Evita duplicatas: só cria se não existe notificação ativa para a medição
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_notificar_medicao_vencida()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_obra_nome  TEXT;
  v_dias_atraso INT;
BEGIN
  -- Só processa medições previstas que passaram da data de previsão sem envio
  IF NEW.data_previsao_medicao IS NULL
     OR NEW.data_envio IS NOT NULL
     OR NEW.status_medicao NOT IN ('prevista', 'nao_iniciada')
     OR NEW.data_previsao_medicao >= CURRENT_DATE
  THEN
    RETURN NEW;
  END IF;

  -- Verifica se já existe notificação ativa (não resolvida) para esta medição
  IF EXISTS (
    SELECT 1 FROM system_notifications
    WHERE medicao_id = NEW.id
      AND tipo = 'medicao_previsao_vencida'
      AND resolvida = false
  ) THEN
    RETURN NEW;
  END IF;

  -- Busca dados da obra
  SELECT op.company_id, op.nome
  INTO v_company_id, v_obra_nome
  FROM obras_portfolio op
  WHERE op.id = NEW.obra_id;

  IF v_company_id IS NULL THEN RETURN NEW; END IF;

  v_dias_atraso := CURRENT_DATE - NEW.data_previsao_medicao;

  INSERT INTO system_notifications (
    company_id, obra_id, medicao_id,
    tipo, titulo, mensagem
  ) VALUES (
    v_company_id,
    NEW.obra_id,
    NEW.id,
    'medicao_previsao_vencida',
    format('Medição %s atrasada — %s', COALESCE(NEW.num_medicao, '—'), COALESCE(v_obra_nome, '—')),
    format('Medição %s da obra "%s" estava prevista para %s (%s dia(s) atrás) e ainda não foi enviada ao fiscal.',
      COALESCE(NEW.num_medicao, '—'),
      COALESCE(v_obra_nome, '—'),
      to_char(NEW.data_previsao_medicao, 'DD/MM/YYYY'),
      v_dias_atraso
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_medicao_vencida ON public.medicoes_ple;
CREATE TRIGGER trg_notify_medicao_vencida
  AFTER INSERT OR UPDATE OF data_previsao_medicao, data_envio, status_medicao
  ON public.medicoes_ple
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notificar_medicao_vencida();

-- ═══════════════════════════════════════════════════════════════
-- FIX 3: Resolver notificação de medição vencida quando medição é enviada
-- Quando data_envio é preenchida, a notificação vencida deve ser resolvida
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_resolver_notif_medicao_enviada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Quando medição é enviada ou aprovada, resolver notificação de vencida
  IF NEW.data_envio IS NOT NULL AND (OLD.data_envio IS NULL OR OLD.data_envio != NEW.data_envio) THEN
    UPDATE system_notifications
    SET resolvida = true,
        resolvida_em = NOW()
    WHERE medicao_id = NEW.id
      AND tipo = 'medicao_previsao_vencida'
      AND resolvida = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolver_notif_medicao_enviada ON public.medicoes_ple;
CREATE TRIGGER trg_resolver_notif_medicao_enviada
  AFTER UPDATE OF data_envio
  ON public.medicoes_ple
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_resolver_notif_medicao_enviada();

-- ═══════════════════════════════════════════════════════════════
-- FIX 4: Backfill — criar notificações para medições já vencidas
-- Cria notificação para cada medição vencida sem notificação ativa
-- ═══════════════════════════════════════════════════════════════
INSERT INTO public.system_notifications (
  company_id, obra_id, medicao_id,
  tipo, titulo, mensagem
)
SELECT
  op.company_id,
  m.obra_id,
  m.id,
  'medicao_previsao_vencida',
  format('Medição %s atrasada — %s', COALESCE(m.num_medicao, '—'), COALESCE(op.nome, '—')),
  format('Medição %s da obra "%s" estava prevista para %s (%s dia(s) atrás) e ainda não foi enviada ao fiscal.',
    COALESCE(m.num_medicao, '—'),
    COALESCE(op.nome, '—'),
    to_char(m.data_previsao_medicao, 'DD/MM/YYYY'),
    (CURRENT_DATE - m.data_previsao_medicao)
  )
FROM public.medicoes_ple m
JOIN public.obras_portfolio op ON op.id = m.obra_id
WHERE m.data_previsao_medicao < CURRENT_DATE
  AND m.data_envio IS NULL
  AND m.status_medicao IN ('prevista', 'nao_iniciada')
  AND NOT EXISTS (
    SELECT 1 FROM public.system_notifications sn
    WHERE sn.medicao_id = m.id
      AND sn.tipo = 'medicao_previsao_vencida'
      AND sn.resolvida = false
  );
