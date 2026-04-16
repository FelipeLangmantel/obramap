
-- 1. Cabeçalho do diário (uma entrada por dia por obra por engenheiro)
CREATE TABLE public.diary_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  engineer_id UUID NOT NULL,
  engineer_name TEXT NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  clima TEXT CHECK (clima IN ('sol','nublado','chuva_fraca','chuva_forte','vento')),
  equipe_presente INTEGER DEFAULT 0,
  observacao_geral TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','finalizado')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, engineer_id, entry_date)
);

-- 2. Itens de produção do diário (cada serviço lançado)
CREATE TABLE public.diary_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diary_entry_id UUID NOT NULL REFERENCES public.diary_entries(id) ON DELETE CASCADE,
  production_id UUID REFERENCES public.productions(id) ON DELETE SET NULL,
  macro_id TEXT NOT NULL,
  macro_name TEXT NOT NULL,
  macro_color TEXT NOT NULL DEFAULT '#6b7280',
  scope_id TEXT NOT NULL,
  scope_name TEXT NOT NULL,
  house_ids INTEGER[] NOT NULL DEFAULT '{}',
  houses_count INTEGER NOT NULL DEFAULT 0,
  percentual_executado NUMERIC NOT NULL DEFAULT 100,
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Fotos do diário
CREATE TABLE public.diary_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diary_entry_id UUID NOT NULL REFERENCES public.diary_entries(id) ON DELETE CASCADE,
  diary_item_id UUID REFERENCES public.diary_items(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  legenda TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX idx_diary_entries_project ON public.diary_entries(project_id, entry_date DESC);
CREATE INDEX idx_diary_entries_engineer ON public.diary_entries(engineer_id, entry_date DESC);
CREATE INDEX idx_diary_items_entry ON public.diary_items(diary_entry_id);

-- RLS
ALTER TABLE public.diary_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diary_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diary_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diary_entries_company" ON public.diary_entries
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "diary_items_via_entry" ON public.diary_items
  FOR ALL TO authenticated
  USING (diary_entry_id IN (
    SELECT id FROM public.diary_entries WHERE company_id = public.get_my_company_id()
  ))
  WITH CHECK (diary_entry_id IN (
    SELECT id FROM public.diary_entries WHERE company_id = public.get_my_company_id()
  ));

CREATE POLICY "diary_photos_via_entry" ON public.diary_photos
  FOR ALL TO authenticated
  USING (diary_entry_id IN (
    SELECT id FROM public.diary_entries WHERE company_id = public.get_my_company_id()
  ))
  WITH CHECK (diary_entry_id IN (
    SELECT id FROM public.diary_entries WHERE company_id = public.get_my_company_id()
  ));

-- Trigger updated_at
CREATE TRIGGER update_diary_entries_updated_at
  BEFORE UPDATE ON public.diary_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket para fotos
INSERT INTO storage.buckets (id, name, public)
  VALUES ('diary-photos', 'diary-photos', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "diary_photos_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'diary-photos');

CREATE POLICY "diary_photos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'diary-photos');

CREATE POLICY "diary_photos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'diary-photos');
