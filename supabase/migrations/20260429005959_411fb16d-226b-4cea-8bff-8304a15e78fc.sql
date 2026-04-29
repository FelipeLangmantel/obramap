-- 1) Trabalhadores presentes no diário (horas individuais por nome)
CREATE TABLE IF NOT EXISTS public.diary_workers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  diary_entry_id UUID NOT NULL REFERENCES public.diary_entries(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  project_id UUID NOT NULL,
  worker_name TEXT NOT NULL,
  profession TEXT NOT NULL,
  worker_type TEXT NOT NULL DEFAULT 'professional' CHECK (worker_type IN ('professional','helper')),
  hours_worked NUMERIC(5,2) NOT NULL DEFAULT 8 CHECK (hours_worked >= 0 AND hours_worked <= 24),
  cost_per_hour NUMERIC(12,2) CHECK (cost_per_hour IS NULL OR cost_per_hour >= 0),
  contractor_contract_id UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diary_workers_entry ON public.diary_workers(diary_entry_id);
CREATE INDEX IF NOT EXISTS idx_diary_workers_project ON public.diary_workers(project_id);
CREATE INDEX IF NOT EXISTS idx_diary_workers_contractor ON public.diary_workers(contractor_contract_id);

ALTER TABLE public.diary_workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diary_workers_select_company"
ON public.diary_workers FOR SELECT TO authenticated
USING (company_id = public.get_my_company_id());

CREATE POLICY "diary_workers_insert_company"
ON public.diary_workers FOR INSERT TO authenticated
WITH CHECK (company_id = public.get_my_company_id() AND public.can_write());

CREATE POLICY "diary_workers_update_company"
ON public.diary_workers FOR UPDATE TO authenticated
USING (company_id = public.get_my_company_id() AND public.can_write())
WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "diary_workers_delete_company"
ON public.diary_workers FOR DELETE TO authenticated
USING (company_id = public.get_my_company_id() AND public.can_write());

CREATE TRIGGER trg_diary_workers_updated_at
BEFORE UPDATE ON public.diary_workers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Vínculo N:N: quais trabalhadores executaram cada lançamento de produção
CREATE TABLE IF NOT EXISTS public.diary_item_workers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  diary_item_id UUID NOT NULL REFERENCES public.diary_items(id) ON DELETE CASCADE,
  diary_worker_id UUID NOT NULL REFERENCES public.diary_workers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  /** horas dedicadas a este lançamento; se NULL, divide igualmente entre os lançamentos do trabalhador */
  hours_allocated NUMERIC(5,2) CHECK (hours_allocated IS NULL OR (hours_allocated >= 0 AND hours_allocated <= 24)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (diary_item_id, diary_worker_id)
);

CREATE INDEX IF NOT EXISTS idx_diary_item_workers_item ON public.diary_item_workers(diary_item_id);
CREATE INDEX IF NOT EXISTS idx_diary_item_workers_worker ON public.diary_item_workers(diary_worker_id);

ALTER TABLE public.diary_item_workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diary_item_workers_select_company"
ON public.diary_item_workers FOR SELECT TO authenticated
USING (company_id = public.get_my_company_id());

CREATE POLICY "diary_item_workers_insert_company"
ON public.diary_item_workers FOR INSERT TO authenticated
WITH CHECK (company_id = public.get_my_company_id() AND public.can_write());

CREATE POLICY "diary_item_workers_delete_company"
ON public.diary_item_workers FOR DELETE TO authenticated
USING (company_id = public.get_my_company_id() AND public.can_write());

CREATE POLICY "diary_item_workers_update_company"
ON public.diary_item_workers FOR UPDATE TO authenticated
USING (company_id = public.get_my_company_id() AND public.can_write())
WITH CHECK (company_id = public.get_my_company_id());

-- 3) Empreiteiro responsável pelo serviço lançado (link com contractor_contracts)
ALTER TABLE public.diary_items
  ADD COLUMN IF NOT EXISTS contractor_contract_id UUID;

CREATE INDEX IF NOT EXISTS idx_diary_items_contractor ON public.diary_items(contractor_contract_id);