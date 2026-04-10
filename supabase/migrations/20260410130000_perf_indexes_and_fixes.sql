-- ═══════════════════════════════════════════════════════════
-- PERFORMANCE: Index crítico em obras_portfolio(company_id)
-- A query mais frequente do sistema não tinha index nesta coluna
-- ═══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_obras_portfolio_company_id
  ON public.obras_portfolio(company_id);

-- Index composto para a query de notificações (company + resolvida + lida)
CREATE INDEX IF NOT EXISTS idx_notif_company_resolvida_lida
  ON public.system_notifications(company_id, resolvida, lida)
  WHERE resolvida = false;

-- Index composto para despesas: obra + tipo (query mais comum em HoldingDespesasPage)
CREATE INDEX IF NOT EXISTS idx_despesas_obra_tipo
  ON public.despesas_mensais(obra_id, tipo_despesa);

-- FIX RLS: restricoes_update WITH CHECK (can_write()) — já criado em migration anterior
-- Este migration já foi aplicado em 20260410120000

-- ═══════════════════════════════════════════════════════════
-- INTEGRIDADE: status_nf='recebido' só permitido quando status_medicao='aprovada'
-- Sem esta constraint, uma medição 'prevista' pode ter status_nf='recebido',
-- fazendo com que apareça erroneamente como recebida nos KPIs financeiros.
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.medicoes_ple DROP CONSTRAINT IF EXISTS chk_nf_recebido_requer_aprovada;
ALTER TABLE public.medicoes_ple
  ADD CONSTRAINT chk_nf_recebido_requer_aprovada
  CHECK (
    status_nf != 'recebido'
    OR status_medicao = 'aprovada'
  );

-- Corrigir dados inconsistentes existentes antes de aplicar a constraint
-- (se houver medições previstas/enviadas com status_nf='recebido')
UPDATE public.medicoes_ple
  SET status_nf = 'pendente', data_pagamento = NULL
  WHERE status_nf = 'recebido'
    AND status_medicao != 'aprovada';
