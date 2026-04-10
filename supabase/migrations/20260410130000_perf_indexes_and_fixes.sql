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
