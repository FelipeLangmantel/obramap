-- Performance: índices nas tabelas mais consultadas do módulo Holding
-- medicoes_ple e documentos_obra são acessadas em todas as páginas
-- mas não tinham índice em obra_id — causando full scan a cada query

-- ── medicoes_ple ────────────────────────────────────────
-- Queries: .in("obra_id", obraIds) em todas as páginas do holding
CREATE INDEX IF NOT EXISTS idx_medicoes_ple_obra_id
  ON public.medicoes_ple(obra_id);

-- Queries: .filter(status_medicao === "aprovada") — índice composto
CREATE INDEX IF NOT EXISTS idx_medicoes_ple_obra_status
  ON public.medicoes_ple(obra_id, status_medicao);

-- Queries: order por ano/mes referencia
CREATE INDEX IF NOT EXISTS idx_medicoes_ple_obra_periodo
  ON public.medicoes_ple(obra_id, ano_referencia DESC);

-- ── documentos_obra ──────────────────────────────────────
-- Query: .in("obra_id", obraIds) no HoldingDashboardView
CREATE INDEX IF NOT EXISTS idx_documentos_obra_obra_id
  ON public.documentos_obra(obra_id);

-- ── despesas_mensais ─────────────────────────────────────
-- Query: .in("obra_id", obraIds) no Insights e PRD
CREATE INDEX IF NOT EXISTS idx_despesas_mensais_obra_id
  ON public.despesas_mensais(obra_id);
