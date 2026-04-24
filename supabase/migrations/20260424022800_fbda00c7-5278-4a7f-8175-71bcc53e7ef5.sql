-- =========================
-- TABELAS PRINCIPAIS DO RDO
-- =========================

-- Mão de obra no Diário
CREATE TABLE IF NOT EXISTS public.diary_labor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  diary_entry_id UUID NOT NULL REFERENCES public.diary_entries(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'propria' CHECK (categoria IN ('propria', 'terceiros')),
  quantidade INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.diary_labor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diary_labor_company" ON public.diary_labor;
CREATE POLICY "diary_labor_company" ON public.diary_labor FOR ALL TO authenticated
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());
CREATE INDEX IF NOT EXISTS idx_diary_labor_entry ON public.diary_labor(diary_entry_id);

-- Equipamentos no Diário
CREATE TABLE IF NOT EXISTS public.diary_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  diary_entry_id UUID NOT NULL REFERENCES public.diary_entries(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.diary_equipment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diary_equipment_company" ON public.diary_equipment;
CREATE POLICY "diary_equipment_company" ON public.diary_equipment FOR ALL TO authenticated
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());
CREATE INDEX IF NOT EXISTS idx_diary_equipment_entry ON public.diary_equipment(diary_entry_id);

-- Atividades no Diário
CREATE TABLE IF NOT EXISTS public.diary_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  diary_entry_id UUID NOT NULL REFERENCES public.diary_entries(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  localizacao TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.diary_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diary_activities_company" ON public.diary_activities;
CREATE POLICY "diary_activities_company" ON public.diary_activities FOR ALL TO authenticated
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());
CREATE INDEX IF NOT EXISTS idx_diary_activities_entry ON public.diary_activities(diary_entry_id);

-- Ocorrências com tags
CREATE TABLE IF NOT EXISTS public.diary_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  diary_entry_id UUID NOT NULL REFERENCES public.diary_entries(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.diary_occurrences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diary_occurrences_company" ON public.diary_occurrences;
CREATE POLICY "diary_occurrences_company" ON public.diary_occurrences FOR ALL TO authenticated
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());
CREATE INDEX IF NOT EXISTS idx_diary_occurrences_entry ON public.diary_occurrences(diary_entry_id);

-- Checklist
CREATE TABLE IF NOT EXISTS public.diary_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  diary_entry_id UUID NOT NULL REFERENCES public.diary_entries(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  concluido BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.diary_checklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diary_checklist_company" ON public.diary_checklist;
CREATE POLICY "diary_checklist_company" ON public.diary_checklist FOR ALL TO authenticated
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());
CREATE INDEX IF NOT EXISTS idx_diary_checklist_entry ON public.diary_checklist(diary_entry_id);

-- Comentários
CREATE TABLE IF NOT EXISTS public.diary_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  diary_entry_id UUID NOT NULL REFERENCES public.diary_entries(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  autor_id UUID REFERENCES auth.users(id),
  autor_nome TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.diary_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diary_comments_company" ON public.diary_comments;
CREATE POLICY "diary_comments_company" ON public.diary_comments FOR ALL TO authenticated
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());
CREATE INDEX IF NOT EXISTS idx_diary_comments_entry ON public.diary_comments(diary_entry_id);

-- Anexos (videos e documentos)
CREATE TABLE IF NOT EXISTS public.diary_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  diary_entry_id UUID NOT NULL REFERENCES public.diary_entries(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('video', 'anexo')),
  storage_path TEXT NOT NULL,
  nome_original TEXT,
  tamanho_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.diary_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diary_attachments_company" ON public.diary_attachments;
CREATE POLICY "diary_attachments_company" ON public.diary_attachments FOR ALL TO authenticated
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());
CREATE INDEX IF NOT EXISTS idx_diary_attachments_entry ON public.diary_attachments(diary_entry_id);

-- Log de edições
CREATE TABLE IF NOT EXISTS public.diary_edit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  diary_entry_id UUID NOT NULL REFERENCES public.diary_entries(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  user_nome TEXT,
  user_email TEXT,
  dispositivo TEXT DEFAULT 'web',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.diary_edit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diary_edit_log_company_select" ON public.diary_edit_log;
CREATE POLICY "diary_edit_log_company_select" ON public.diary_edit_log FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());
DROP POLICY IF EXISTS "diary_edit_log_company_insert" ON public.diary_edit_log;
CREATE POLICY "diary_edit_log_company_insert" ON public.diary_edit_log FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id());
CREATE INDEX IF NOT EXISTS idx_diary_edit_log_entry ON public.diary_edit_log(diary_entry_id, created_at DESC);

-- Visualizações
CREATE TABLE IF NOT EXISTS public.diary_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  diary_entry_id UUID NOT NULL REFERENCES public.diary_entries(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  user_nome TEXT,
  view_count INTEGER NOT NULL DEFAULT 1,
  viewed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(diary_entry_id, user_id)
);
ALTER TABLE public.diary_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diary_views_company" ON public.diary_views;
CREATE POLICY "diary_views_company" ON public.diary_views FOR ALL TO authenticated
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());
CREATE INDEX IF NOT EXISTS idx_diary_views_entry ON public.diary_views(diary_entry_id);

-- Assinaturas digitais
CREATE TABLE IF NOT EXISTS public.diary_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  diary_entry_id UUID NOT NULL REFERENCES public.diary_entries(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK (slot IN (1, 2)),
  signature_data TEXT NOT NULL,
  assinado_por UUID REFERENCES auth.users(id),
  assinado_por_nome TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(diary_entry_id, slot)
);
ALTER TABLE public.diary_signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diary_signatures_company" ON public.diary_signatures;
CREATE POLICY "diary_signatures_company" ON public.diary_signatures FOR ALL TO authenticated
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());
CREATE INDEX IF NOT EXISTS idx_diary_signatures_entry ON public.diary_signatures(diary_entry_id);

-- =========================
-- COLUNAS NOVAS EM diary_entries
-- =========================
ALTER TABLE public.diary_entries
  ADD COLUMN IF NOT EXISTS num_relatorio INTEGER,
  ADD COLUMN IF NOT EXISTS condicao_obra TEXT DEFAULT 'praticavel' CHECK (condicao_obra IN ('praticavel', 'impraticavel')),
  ADD COLUMN IF NOT EXISTS condicao_manha TEXT DEFAULT 'praticavel' CHECK (condicao_manha IN ('praticavel', 'impraticavel')),
  ADD COLUMN IF NOT EXISTS condicao_tarde TEXT DEFAULT 'praticavel' CHECK (condicao_tarde IN ('praticavel', 'impraticavel')),
  ADD COLUMN IF NOT EXISTS condicao_noite TEXT,
  ADD COLUMN IF NOT EXISTS mm_chuva NUMERIC,
  ADD COLUMN IF NOT EXISTS status_aprovacao TEXT DEFAULT 'preenchendo' CHECK (status_aprovacao IN ('preenchendo', 'revisando', 'aprovado')),
  ADD COLUMN IF NOT EXISTS noite_ativa BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS clima_manha TEXT DEFAULT 'claro' CHECK (clima_manha IN ('claro', 'nublado', 'chuvoso')),
  ADD COLUMN IF NOT EXISTS clima_tarde TEXT DEFAULT 'claro' CHECK (clima_tarde IN ('claro', 'nublado', 'chuvoso')),
  ADD COLUMN IF NOT EXISTS clima_noite TEXT;

-- Numeração sequencial por projeto
CREATE OR REPLACE FUNCTION public.set_num_relatorio()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.num_relatorio IS NULL THEN
    SELECT COALESCE(MAX(num_relatorio), 0) + 1
      INTO NEW.num_relatorio
      FROM public.diary_entries
      WHERE project_id = NEW.project_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS set_num_relatorio_trigger ON public.diary_entries;
CREATE TRIGGER set_num_relatorio_trigger
  BEFORE INSERT ON public.diary_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_num_relatorio();

-- =========================
-- CATÁLOGOS GLOBAIS (seed)
-- =========================

-- Tags de ocorrência padrão
CREATE TABLE IF NOT EXISTS public.occurrence_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  is_default BOOLEAN DEFAULT true,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.occurrence_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "occurrence_tags_read_all" ON public.occurrence_tags;
CREATE POLICY "occurrence_tags_read_all" ON public.occurrence_tags FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_my_company_id());
DROP POLICY IF EXISTS "occurrence_tags_insert_company" ON public.occurrence_tags;
CREATE POLICY "occurrence_tags_insert_company" ON public.occurrence_tags FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id());

INSERT INTO public.occurrence_tags (nome) VALUES
  ('Acidente de trabalho'), ('Alteração de projeto'), ('Dia Chuvoso'),
  ('Dia parado'), ('Falta de equipamento'), ('Falta de material'),
  ('Falta de mão de obra'), ('Horas Improdutivas'), ('Chuva forte'),
  ('Vento forte'), ('Embargo'), ('Interdição')
ON CONFLICT (nome) DO NOTHING;

-- Mão de obra padrão
CREATE TABLE IF NOT EXISTS public.labor_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'propria' CHECK (categoria IN ('propria', 'terceiros')),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (nome, categoria, company_id)
);
ALTER TABLE public.labor_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "labor_types_read_all" ON public.labor_types;
CREATE POLICY "labor_types_read_all" ON public.labor_types FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_my_company_id());
DROP POLICY IF EXISTS "labor_types_insert_company" ON public.labor_types;
CREATE POLICY "labor_types_insert_company" ON public.labor_types FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id());

INSERT INTO public.labor_types (nome, categoria) VALUES
  ('Ajudante','propria'), ('Eletricista','propria'), ('Engenheiro','propria'),
  ('Estagiário','propria'), ('Gesseiro','propria'), ('Mestre de Obra','propria'),
  ('Pedreiro','propria'), ('Servente','propria'), ('Técnico em Edificações','propria'),
  ('Ajudante','terceiros'), ('Almoxarifado','terceiros'), ('Carpinteiro','terceiros'),
  ('Eletricista','terceiros'), ('Encarregado','terceiros'), ('Ferreiro','terceiros'),
  ('Hidráulico','terceiros'), ('Mestre','terceiros'), ('Pedreiro','terceiros'),
  ('Pintor','terceiros'), ('Serralheiro','terceiros'), ('Topógrafo','terceiros')
ON CONFLICT DO NOTHING;

-- Equipamentos padrão
CREATE TABLE IF NOT EXISTS public.equipment_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (nome, company_id)
);
ALTER TABLE public.equipment_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipment_types_read_all" ON public.equipment_types;
CREATE POLICY "equipment_types_read_all" ON public.equipment_types FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_my_company_id());
DROP POLICY IF EXISTS "equipment_types_insert_company" ON public.equipment_types;
CREATE POLICY "equipment_types_insert_company" ON public.equipment_types FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id());

INSERT INTO public.equipment_types (nome) VALUES
  ('Betoneira'), ('Caminhão Basculante'), ('Compactador de solo'),
  ('Escavadeira'), ('Guindaste'), ('Picareta'), ('Pá Carregadeira'), ('Retro Escavadeira')
ON CONFLICT DO NOTHING;

-- =========================
-- STORAGE BUCKET PARA VÍDEOS E ANEXOS
-- =========================
INSERT INTO storage.buckets (id, name, public) VALUES ('diary-attachments', 'diary-attachments', false)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "diary_attachments_select" ON storage.objects;
CREATE POLICY "diary_attachments_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'diary-attachments' AND (storage.foldername(name))[1] = get_my_company_id()::text);

DROP POLICY IF EXISTS "diary_attachments_insert" ON storage.objects;
CREATE POLICY "diary_attachments_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'diary-attachments' AND (storage.foldername(name))[1] = get_my_company_id()::text);

DROP POLICY IF EXISTS "diary_attachments_delete" ON storage.objects;
CREATE POLICY "diary_attachments_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'diary-attachments' AND (storage.foldername(name))[1] = get_my_company_id()::text);