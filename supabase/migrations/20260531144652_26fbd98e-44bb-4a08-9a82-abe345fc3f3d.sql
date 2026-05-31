-- =====================================================================
-- Fase A — Versionamento de modelos 3D (incremental e reversível)
-- =====================================================================
-- Cria a tabela map_3d_model_files, backfilla os 6 modelos ativos hoje
-- em map_layouts.model_3d_url, expõe RPCs SEGURAS (somente leitura /
-- dry-run). NENHUM arquivo do Storage é apagado. O fluxo atual de
-- upload/leitura (map_layouts.model_3d_url + useGLTF) continua intacto.
-- =====================================================================

-- 1) ENUM de status (idempotente)
DO $$ BEGIN
  CREATE TYPE public.map_3d_model_status AS ENUM (
    'active',             -- modelo em uso pelo map_layouts.model_3d_url
    'replaced',           -- substituído por um mais novo (preservado)
    'preserved',          -- marcado pelo usuário para nunca apagar
    'orphan_pending_delete', -- candidato a purge (não apaga agora)
    'upload_failed'       -- upload registrado mas viewer não conseguiu carregar
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Tabela principal
CREATE TABLE IF NOT EXISTS public.map_3d_model_files (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id        uuid NOT NULL,
  map_layout_id     uuid REFERENCES public.map_layouts(id) ON DELETE SET NULL,
  file_name         text NOT NULL,
  storage_bucket    text NOT NULL DEFAULT '3d-models',
  storage_path      text NOT NULL, -- ex.: {company}/{project}/gltf/{ts}-{slug}.glb
  file_size         bigint,
  file_hash         text,          -- sha256 (preenchido em uploads futuros)
  model_type        text NOT NULL DEFAULT 'gltf', -- gltf | glb | gltf-parts
  status            public.map_3d_model_status NOT NULL DEFAULT 'active',
  preserved         boolean NOT NULL DEFAULT false,
  imported_by       uuid,
  imported_at       timestamptz NOT NULL DEFAULT now(),
  replaced_at       timestamptz,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_3d_model_files_path_unique UNIQUE (storage_bucket, storage_path)
);

-- Apenas 1 ativo por projeto
CREATE UNIQUE INDEX IF NOT EXISTS map_3d_model_files_one_active_per_project
  ON public.map_3d_model_files (project_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS map_3d_model_files_project_idx
  ON public.map_3d_model_files (project_id, status);

CREATE INDEX IF NOT EXISTS map_3d_model_files_company_idx
  ON public.map_3d_model_files (company_id, status);

-- 3) GRANTs (Data API)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_3d_model_files TO authenticated;
GRANT ALL ON public.map_3d_model_files TO service_role;

-- 4) RLS
ALTER TABLE public.map_3d_model_files ENABLE ROW LEVEL SECURITY;

-- Leitura: usuários da mesma company
CREATE POLICY "map_3d_model_files_select_same_company"
  ON public.map_3d_model_files
  FOR SELECT
  TO authenticated
  USING (company_id = public.get_my_company_id());

-- Escrita: somente quem pode editar a empresa (admins/editores)
CREATE POLICY "map_3d_model_files_write_company_editors"
  ON public.map_3d_model_files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.can_write()
  );

CREATE POLICY "map_3d_model_files_update_company_editors"
  ON public.map_3d_model_files
  FOR UPDATE
  TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.can_write()
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.can_write()
  );

CREATE POLICY "map_3d_model_files_delete_company_editors"
  ON public.map_3d_model_files
  FOR DELETE
  TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.can_write()
  );

-- 5) Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_map_3d_model_files_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS map_3d_model_files_set_updated_at ON public.map_3d_model_files;
CREATE TRIGGER map_3d_model_files_set_updated_at
  BEFORE UPDATE ON public.map_3d_model_files
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_map_3d_model_files_updated_at();

-- 6) Helper: extrair storage_path da URL do Supabase Storage (public ou sign)
CREATE OR REPLACE FUNCTION public.extract_storage_path_from_url(_url text, _bucket text DEFAULT '3d-models')
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  marker_public text := '/object/public/' || _bucket || '/';
  marker_sign   text := '/object/sign/'   || _bucket || '/';
  pos_p int;
  pos_s int;
  raw   text;
BEGIN
  IF _url IS NULL THEN RETURN NULL; END IF;
  pos_p := position(marker_public IN _url);
  pos_s := position(marker_sign   IN _url);
  IF pos_p > 0 THEN
    raw := substring(_url FROM pos_p + length(marker_public));
  ELSIF pos_s > 0 THEN
    raw := substring(_url FROM pos_s + length(marker_sign));
  ELSE
    RETURN NULL;
  END IF;
  -- remove query string
  raw := split_part(raw, '?', 1);
  RETURN raw;
END;
$$;

-- 7) Backfill: insere SOMENTE os modelos ativos hoje (idempotente)
INSERT INTO public.map_3d_model_files (
  project_id, company_id, map_layout_id, file_name, storage_bucket,
  storage_path, file_size, model_type, status, imported_at, notes
)
SELECT
  ml.project_id,
  p.company_id,
  ml.id AS map_layout_id,
  regexp_replace(
    public.extract_storage_path_from_url(ml.model_3d_url, '3d-models'),
    '^.*/', ''
  ) AS file_name,
  '3d-models' AS storage_bucket,
  public.extract_storage_path_from_url(ml.model_3d_url, '3d-models') AS storage_path,
  (so.metadata->>'size')::bigint AS file_size,
  CASE
    WHEN public.extract_storage_path_from_url(ml.model_3d_url, '3d-models') ILIKE '%/gltf-parts/%' THEN 'gltf-parts'
    WHEN public.extract_storage_path_from_url(ml.model_3d_url, '3d-models') ILIKE '%.gltf' THEN 'gltf'
    ELSE 'glb'
  END AS model_type,
  'active'::public.map_3d_model_status,
  COALESCE(so.created_at, ml.updated_at, now()),
  'Backfill inicial — modelo ativo encontrado em map_layouts.model_3d_url'
FROM public.map_layouts ml
JOIN public.projects p ON p.id = ml.project_id
LEFT JOIN storage.objects so
  ON so.bucket_id = '3d-models'
 AND so.name = public.extract_storage_path_from_url(ml.model_3d_url, '3d-models')
WHERE ml.model_3d_url IS NOT NULL
  AND ml.model_3d_url <> ''
  AND public.extract_storage_path_from_url(ml.model_3d_url, '3d-models') IS NOT NULL
ON CONFLICT (storage_bucket, storage_path) DO NOTHING;

-- 8) RPC: listar modelos por projeto (leitura)
CREATE OR REPLACE FUNCTION public.list_3d_model_files(_project_id uuid)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  map_layout_id uuid,
  file_name text,
  storage_bucket text,
  storage_path text,
  file_size bigint,
  model_type text,
  status public.map_3d_model_status,
  preserved boolean,
  imported_at timestamptz,
  replaced_at timestamptz,
  notes text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.id, f.project_id, f.map_layout_id, f.file_name, f.storage_bucket,
    f.storage_path, f.file_size, f.model_type, f.status, f.preserved,
    f.imported_at, f.replaced_at, f.notes
  FROM public.map_3d_model_files f
  WHERE f.project_id = _project_id
    AND f.company_id = public.get_my_company_id()
  ORDER BY (f.status = 'active') DESC, f.imported_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_3d_model_files(uuid) TO authenticated;

-- 9) RPC: auditoria DRY-RUN de órfãos no bucket '3d-models'
--    NÃO apaga nada. Lista objetos do Storage que:
--      - pertencem à mesma company do usuário
--      - NÃO estão referenciados em map_layouts.model_3d_url
--      - NÃO estão como 'active' ou 'preserved' em map_3d_model_files
CREATE OR REPLACE FUNCTION public.audit_3d_orphans_dry_run(_project_id uuid DEFAULT NULL)
RETURNS TABLE (
  storage_path text,
  file_size    bigint,
  created_at   timestamptz,
  age_days     integer,
  company_id   uuid,
  project_id   uuid,
  reason       text,
  would_delete boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_company uuid := public.get_my_company_id();
BEGIN
  RETURN QUERY
  WITH active_paths AS (
    SELECT public.extract_storage_path_from_url(ml.model_3d_url, '3d-models') AS path
    FROM public.map_layouts ml
    WHERE ml.model_3d_url IS NOT NULL AND ml.model_3d_url <> ''
  ),
  registered AS (
    SELECT f.storage_path, f.status, f.preserved, f.project_id
    FROM public.map_3d_model_files f
  ),
  objs AS (
    SELECT
      so.name AS storage_path,
      (so.metadata->>'size')::bigint AS file_size,
      so.created_at,
      split_part(so.name, '/', 1)::uuid AS obj_company_id,
      NULLIF(split_part(so.name, '/', 2), '')::uuid AS obj_project_id
    FROM storage.objects so
    WHERE so.bucket_id = '3d-models'
  )
  SELECT
    o.storage_path,
    o.file_size,
    o.created_at,
    EXTRACT(DAY FROM (now() - o.created_at))::int AS age_days,
    o.obj_company_id,
    o.obj_project_id,
    CASE
      WHEN o.storage_path IN (SELECT path FROM active_paths) THEN 'active_in_map_layouts'
      WHEN EXISTS (SELECT 1 FROM registered r WHERE r.storage_path = o.storage_path AND r.preserved) THEN 'preserved'
      WHEN EXISTS (SELECT 1 FROM registered r WHERE r.storage_path = o.storage_path AND r.status = 'active') THEN 'registered_active'
      WHEN EXTRACT(DAY FROM (now() - o.created_at)) < 7 THEN 'too_recent(<7d)'
      ELSE 'orphan_candidate'
    END AS reason,
    CASE
      WHEN o.storage_path IN (SELECT path FROM active_paths) THEN false
      WHEN EXISTS (SELECT 1 FROM registered r WHERE r.storage_path = o.storage_path AND (r.preserved OR r.status = 'active')) THEN false
      WHEN EXTRACT(DAY FROM (now() - o.created_at)) < 7 THEN false
      ELSE true
    END AS would_delete
  FROM objs o
  WHERE o.obj_company_id = my_company
    AND (_project_id IS NULL OR o.obj_project_id = _project_id)
  ORDER BY would_delete DESC, o.file_size DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_3d_orphans_dry_run(uuid) TO authenticated;
