-- diary_items NÃO possui project_id nem company_id; usa diary_entry_id como vínculo.
-- Indexamos pelas colunas reais usadas no recompute (macro_id, scope_id) filtrando ativos.
CREATE INDEX IF NOT EXISTS idx_diary_items_recompute
  ON public.diary_items (macro_id, scope_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_weekly_productions_capacity_check
  ON public.weekly_productions (project_id, scope_id)
  WHERE deleted_at IS NULL;

-- diary_entries NÃO possui deleted_at; criamos índice simples.
CREATE INDEX IF NOT EXISTS idx_diary_entries_project_date
  ON public.diary_entries (project_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_diary_items_entry_active
  ON public.diary_items (diary_entry_id)
  WHERE deleted_at IS NULL;

ALTER FUNCTION public.recompute_house_progress_from_diary(uuid, integer[])
  SET statement_timeout = '15s';