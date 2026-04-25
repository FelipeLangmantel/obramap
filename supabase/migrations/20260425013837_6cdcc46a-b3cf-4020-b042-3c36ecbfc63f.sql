-- ============================================================
-- Tabela: diary_legal_config
-- Documentação legal do Relatório Diário de Obra (RDO) por projeto
-- ============================================================

CREATE TYPE public.contratante_tipo AS ENUM ('publico', 'privado', 'misto');
CREATE TYPE public.rdo_pdf_template AS ENUM ('orgao_publico', 'corporativo_moderno');

CREATE TABLE public.diary_legal_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,

  -- ── Contratante (cliente / órgão) ──
  contratante_tipo public.contratante_tipo NOT NULL DEFAULT 'privado',
  contratante_nome TEXT,
  contratante_cnpj_cpf TEXT,
  contratante_orgao TEXT,             -- ex: "Secretaria de Obras / Prefeitura X"
  contratante_endereco TEXT,
  contratante_municipio TEXT,
  contratante_estado TEXT,

  -- ── Contratada (executora) ──
  contratada_razao_social TEXT,
  contratada_cnpj TEXT,
  contratada_endereco TEXT,
  contratada_municipio TEXT,
  contratada_estado TEXT,

  -- ── Contrato ──
  contrato_numero TEXT,
  contrato_data_assinatura DATE,
  contrato_objeto TEXT,               -- objeto contratual (ex: "Construção de 70 unidades habitacionais")
  contrato_valor NUMERIC(18,2),
  contrato_prazo_dias INTEGER,
  contrato_modalidade TEXT,           -- ex: "Pregão Eletrônico nº 012/2024", "Concorrência Pública"
  processo_licitatorio TEXT,          -- ex: "Processo nº 2024.001.0001234"

  -- ── Responsável técnico ──
  responsavel_tecnico_nome TEXT,
  responsavel_tecnico_crea TEXT,      -- CREA / CAU / CFT
  responsavel_tecnico_art TEXT,       -- nº ART / RRT / TRT

  -- ── Configuração do PDF ──
  pdf_template public.rdo_pdf_template NOT NULL DEFAULT 'orgao_publico',
  rodape_observacoes TEXT,            -- texto livre para rodapé legal

  -- ── Auditoria ──
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_diary_legal_config_project ON public.diary_legal_config(project_id);
CREATE INDEX idx_diary_legal_config_company ON public.diary_legal_config(company_id);

-- ── Trigger updated_at ──
CREATE TRIGGER trg_diary_legal_config_updated_at
BEFORE UPDATE ON public.diary_legal_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS ──
ALTER TABLE public.diary_legal_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mesma empresa pode ver config legal do RDO"
ON public.diary_legal_config FOR SELECT
TO authenticated
USING (company_id = public.get_my_company_id());

CREATE POLICY "Admin/coordenador pode inserir config legal do RDO"
ON public.diary_legal_config FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.get_my_company_id()
  AND public.is_coordenador_or_admin(auth.uid(), project_id)
);

CREATE POLICY "Admin/coordenador pode atualizar config legal do RDO"
ON public.diary_legal_config FOR UPDATE
TO authenticated
USING (
  company_id = public.get_my_company_id()
  AND public.is_coordenador_or_admin(auth.uid(), project_id)
)
WITH CHECK (
  company_id = public.get_my_company_id()
  AND public.is_coordenador_or_admin(auth.uid(), project_id)
);

CREATE POLICY "Admin pode deletar config legal do RDO"
ON public.diary_legal_config FOR DELETE
TO authenticated
USING (
  company_id = public.get_my_company_id()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.system_role::text IN ('admin', 'system_admin')
  )
);
