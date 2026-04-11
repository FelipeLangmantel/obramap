
-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.fn_gerar_alertas_operacionais()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- 1. Prazo vencido
  INSERT INTO system_notifications (company_id, obra_id, tipo, titulo, mensagem)
  SELECT company_id, id, 'prazo_obra_vencido',
    format('Prazo vencido — %s', nome),
    format('Obra "%s" com prazo encerrado em %s.', nome, to_char(data_fim_prevista,'DD/MM/YYYY'))
  FROM obras_portfolio
  WHERE status = 'em_andamento' AND data_fim_prevista < CURRENT_DATE
    AND NOT EXISTS (SELECT 1 FROM system_notifications sn
      WHERE sn.obra_id = obras_portfolio.id AND sn.tipo = 'prazo_obra_vencido' AND sn.resolvida = false);

  -- 2. Prazo a vencer em 30 dias
  INSERT INTO system_notifications (company_id, obra_id, tipo, titulo, mensagem)
  SELECT company_id, id, 'prazo_obra_avencer',
    format('Prazo a vencer — %s', nome),
    format('Obra "%s" vence em %s (%s dias).', nome, to_char(data_fim_prevista,'DD/MM/YYYY'),
      (data_fim_prevista - CURRENT_DATE))
  FROM obras_portfolio
  WHERE status = 'em_andamento'
    AND data_fim_prevista BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
    AND NOT EXISTS (SELECT 1 FROM system_notifications sn
      WHERE sn.obra_id = obras_portfolio.id AND sn.tipo = 'prazo_obra_avencer' AND sn.resolvida = false);

  -- 3. Obra sem medição no período cadastrado
  INSERT INTO system_notifications (company_id, obra_id, tipo, titulo, mensagem)
  SELECT op.company_id, op.id, 'obra_sem_medicao_no_periodo',
    format('Sem medição — %s', op.nome),
    format('Obra "%s" não tem medição nos últimos %s dias (período: %s).',
      op.nome,
      CASE op.periodo_medicao WHEN 'Semanal' THEN 7 WHEN 'Quinzenal' THEN 15 ELSE 30 END,
      op.periodo_medicao)
  FROM obras_portfolio op
  WHERE op.status = 'em_andamento' AND op.periodo_medicao IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM medicoes_ple m WHERE m.obra_id = op.id
        AND m.created_at > now() - (
          CASE op.periodo_medicao WHEN 'Semanal' THEN INTERVAL '7 days'
          WHEN 'Quinzenal' THEN INTERVAL '15 days' ELSE INTERVAL '30 days' END))
    AND NOT EXISTS (SELECT 1 FROM system_notifications sn
      WHERE sn.obra_id = op.id AND sn.tipo = 'obra_sem_medicao_no_periodo' AND sn.resolvida = false);

  -- 4. Medição sem data de previsão
  INSERT INTO system_notifications (company_id, obra_id, medicao_id, tipo, titulo, mensagem)
  SELECT op.company_id, m.obra_id, m.id, 'medicao_sem_previsao',
    format('Medição sem previsão — %s', op.nome),
    format('Medição %s da obra "%s" está prevista mas sem data de envio cadastrada.',
      COALESCE(m.num_medicao,'—'), op.nome)
  FROM medicoes_ple m
  JOIN obras_portfolio op ON op.id = m.obra_id
  WHERE m.status_medicao IN ('prevista','nao_iniciada') AND m.data_previsao_medicao IS NULL
    AND NOT EXISTS (SELECT 1 FROM system_notifications sn
      WHERE sn.medicao_id = m.id AND sn.tipo = 'medicao_sem_previsao' AND sn.resolvida = false);

  -- 5. Desvio financeiro > 10%
  INSERT INTO system_notifications (company_id, obra_id, medicao_id, tipo, titulo, mensagem)
  SELECT op.company_id, m.obra_id, m.id, 'desvio_financeiro_relevante',
    format('Desvio > 10%% — %s', op.nome),
    format('Medição %s da obra "%s": previsto %s, acatado %s (desvio %.1f%%).',
      COALESCE(m.num_medicao,'—'), op.nome,
      m.valor_previsto_medicao::text, m.valor_acatado::text,
      ABS(m.valor_acatado - m.valor_previsto_medicao) / NULLIF(m.valor_previsto_medicao,0) * 100)
  FROM medicoes_ple m
  JOIN obras_portfolio op ON op.id = m.obra_id
  WHERE m.status_medicao = 'aprovada'
    AND m.valor_previsto_medicao > 0
    AND ABS(m.valor_acatado - m.valor_previsto_medicao) / m.valor_previsto_medicao > 0.10
    AND NOT EXISTS (SELECT 1 FROM system_notifications sn
      WHERE sn.medicao_id = m.id AND sn.tipo = 'desvio_financeiro_relevante' AND sn.resolvida = false);
END;
$$;

-- Schedule hourly execution
SELECT cron.schedule('alertas-operacionais', '0 * * * *',
  'SELECT public.fn_gerar_alertas_operacionais();');
