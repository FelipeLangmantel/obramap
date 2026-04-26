-- ============================================================
-- Performance: índices para queries críticas + timeouts de segurança
-- Commit: fix(perf): índices para recompute + timeout de segurança
-- ============================================================

-- 1) Índice cobrindo a query mais pesada de recompute_house_progress_from_diary
--    Evita Seq Scan em diary_items para cada combinação project/macro/scope
CREATE INDEX IF NOT EXISTS idx_diary_items_recompute
  ON public.diary_items (project_id, macro_id, scope_id)
  WHERE deleted_at IS NULL;

-- 2) Índice para o filtro de house_ids no trigger validate_production_capacity
--    GIN permite checagem eficiente de ANY(house_ids) por scope/projeto
CREATE INDEX IF NOT EXISTS idx_weekly_productions_capacity_check
  ON public.weekly_productions (project_id, scope_id)
  WHERE deleted_at IS NULL;

-- 3) Timeout de segurança na RPC de recalculo
--    Evita que sync offline com obra grande trave a conexão do banco
ALTER FUNCTION public.recompute_house_progress_from_diary(uuid, integer[] DEFAULT NULL)
  SET statement_timeout = '15s';

-- 4) Índice parcial em diary_entries para Realtime e loadEntry
CREATE INDEX IF NOT EXISTS idx_diary_entries_project_date
  ON public.diary_entries (project_id, entry_date DESC)
  WHERE deleted_at IS NULL;

-- 5) Índice em diary_items para loadItems por entry
CREATE INDEX IF NOT EXISTS idx_diary_items_entry_active
  ON public.diary_items (diary_entry_id)
  WHERE deleted_at IS NULL;
