-- 1. Log de exclusão de produção
CREATE TABLE public.production_deletion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  deleted_by UUID NOT NULL REFERENCES auth.users(id),
  deleted_by_nome TEXT NOT NULL,
  justificativa TEXT NOT NULL,
  weekly_production_id TEXT NOT NULL,
  macro_name TEXT NOT NULL,
  scope_name TEXT NOT NULL,
  house_ids INTEGER[] NOT NULL DEFAULT '{}',
  houses_count INTEGER NOT NULL DEFAULT 0,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  created_by_original TEXT,
  desvios_removidos INTEGER NOT NULL DEFAULT 0,
  diary_items_removidos INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.production_deletion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deletion_log_company" ON public.production_deletion_log
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE INDEX idx_deletion_log_project ON public.production_deletion_log(project_id, created_at DESC);

-- 2. Correções de itens de diário
CREATE TABLE public.diary_item_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  diary_entry_id UUID NOT NULL REFERENCES public.diary_entries(id) ON DELETE CASCADE,
  diary_item_id UUID REFERENCES public.diary_items(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('exclusao','ajuste_casas','ajuste_percentual')),
  house_ids_anterior INTEGER[] NOT NULL DEFAULT '{}',
  percentual_anterior NUMERIC NOT NULL DEFAULT 0,
  house_ids_posterior INTEGER[],
  percentual_posterior NUMERIC,
  macro_id TEXT NOT NULL,
  macro_name TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  scope_name TEXT NOT NULL,
  justificativa TEXT NOT NULL,
  corrigido_por UUID NOT NULL REFERENCES auth.users(id),
  corrigido_por_nome TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.diary_item_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "corrections_company" ON public.diary_item_corrections
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE INDEX idx_corrections_entry ON public.diary_item_corrections(diary_entry_id);
CREATE INDEX idx_corrections_project ON public.diary_item_corrections(project_id, created_at DESC);