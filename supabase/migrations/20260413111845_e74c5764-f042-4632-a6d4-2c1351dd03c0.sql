
CREATE OR REPLACE FUNCTION public.fn_gerar_alertas_operacionais()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO system_notifications (company_id, obra_id, tipo, titulo, mensagem, modulo)
  SELECT company_id, id, 'prazo_obra_vencido',
    format('Prazo vencido — %s', nome),
    format('Obra "%s" com prazo encerrado em %s.', nome, to_char((data_inicio + prazo_dias),'DD/MM/YYYY')),
    'holding'
  FROM obras_portfolio
  WHERE status = 'em_andamento' AND data_inicio IS NOT NULL AND prazo_dias IS NOT NULL
    AND (data_inicio + prazo_dias) < CURRENT_DATE
    AND NOT EXISTS (SELECT 1 FROM system_notifications sn WHERE sn.obra_id = obras_portfolio.id AND sn.tipo = 'prazo_obra_vencido' AND sn.resolvida = false);

  INSERT INTO system_notifications (company_id, obra_id, tipo, titulo, mensagem, modulo)
  SELECT company_id, id, 'prazo_obra_avencer',
    format('Prazo a vencer — %s', nome),
    format('Obra "%s" vence em %s (%s dias).', nome, to_char((data_inicio + prazo_dias),'DD/MM/YYYY'), ((data_inicio + prazo_dias) - CURRENT_DATE)),
    'holding'
  FROM obras_portfolio
  WHERE status = 'em_andamento' AND data_inicio IS NOT NULL AND prazo_dias IS NOT NULL
    AND (data_inicio + prazo_dias) BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
    AND NOT EXISTS (SELECT 1 FROM system_notifications sn WHERE sn.obra_id = obras_portfolio.id AND sn.tipo = 'prazo_obra_avencer' AND sn.resolvida = false);

  INSERT INTO system_notifications (company_id, obra_id, medicao_id, tipo, titulo, mensagem, modulo)
  SELECT op.company_id, m.obra_id, m.id, 'medicao_previsao_vencida',
    format('Medição atrasada — %s', op.nome),
    format('Medição %s da obra "%s" prevista para %s (%s dias de atraso).', COALESCE(m.num_medicao,'—'), op.nome, to_char(m.data_previsao_medicao,'DD/MM/YYYY'), (CURRENT_DATE - m.data_previsao_medicao)),
    'holding'
  FROM medicoes_ple m JOIN obras_portfolio op ON op.id = m.obra_id
  WHERE m.status_medicao IN ('prevista','nao_iniciada') AND m.data_previsao_medicao IS NOT NULL AND m.data_previsao_medicao < CURRENT_DATE AND m.data_envio IS NULL
    AND NOT EXISTS (SELECT 1 FROM system_notifications sn WHERE sn.medicao_id = m.id AND sn.tipo = 'medicao_previsao_vencida' AND sn.resolvida = false);

  INSERT INTO system_notifications (company_id, obra_id, tipo, titulo, mensagem, modulo)
  SELECT op.company_id, op.id, 'obra_sem_medicao_no_periodo',
    format('Sem medição — %s', op.nome),
    format('Obra "%s" sem medição no período (%s).', op.nome, op.periodo_medicao),
    'holding'
  FROM obras_portfolio op
  WHERE op.status = 'em_andamento' AND op.periodo_medicao IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM medicoes_ple m WHERE m.obra_id = op.id AND COALESCE(m.data_envio, m.data_previsao_medicao) > (CURRENT_DATE - (CASE op.periodo_medicao WHEN 'Semanal' THEN 7 WHEN 'Quinzenal' THEN 15 ELSE 30 END)))
    AND NOT EXISTS (SELECT 1 FROM system_notifications sn WHERE sn.obra_id = op.id AND sn.tipo = 'obra_sem_medicao_no_periodo' AND sn.resolvida = false);

  INSERT INTO system_notifications (company_id, obra_id, medicao_id, tipo, titulo, mensagem, modulo)
  SELECT op.company_id, m.obra_id, m.id, 'desvio_financeiro_relevante',
    format('Desvio financeiro — %s', op.nome),
    format('Medição %s: previsto %s, acatado %s.', COALESCE(m.num_medicao,'—'), to_char(m.valor_previsto_medicao,'FM"R$"999G999G990D00'), to_char(m.valor_acatado,'FM"R$"999G999G990D00')),
    'holding'
  FROM medicoes_ple m JOIN obras_portfolio op ON op.id = m.obra_id
  WHERE m.status_medicao = 'aprovada' AND m.valor_previsto_medicao > 0
    AND ABS(m.valor_acatado - m.valor_previsto_medicao) / m.valor_previsto_medicao > 0.10
    AND NOT EXISTS (SELECT 1 FROM system_notifications sn WHERE sn.medicao_id = m.id AND sn.tipo = 'desvio_financeiro_relevante' AND sn.resolvida = false);

  UPDATE system_notifications SET resolvida = true, resolvida_em = now()
  WHERE tipo = 'medicao_previsao_vencida' AND resolvida = false
    AND medicao_id IN (SELECT id FROM medicoes_ple WHERE data_envio IS NOT NULL);

  UPDATE system_notifications SET resolvida = true, resolvida_em = now()
  WHERE tipo IN ('prazo_obra_vencido','prazo_obra_avencer') AND resolvida = false
    AND obra_id IN (SELECT id FROM obras_portfolio WHERE status != 'em_andamento');
END;
$$;
