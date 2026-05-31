-- =====================================================================
-- Fase B — Exclusão controlada de modelos 3D antigos/órfãos
-- Apenas infraestrutura (campos, status, auditoria e validação).
-- Nenhuma exclusão é executada automaticamente.
-- =====================================================================

-- 1) Novo status 'deleted' no enum
ALTER TYPE public.map_3d_model_status ADD VALUE IF NOT EXISTS 'deleted';

-- 2) Campos de soft-delete em map_3d_model_files
ALTER TABLE public.map_3d_model_files
  ADD COLUMN IF NOT EXISTS deleted_at    timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by    uuid,
  ADD COLUMN IF NOT EXISTS delete_reason text;

-- 3) Tabela de auditoria (histórico imutável)
CREATE TABLE IF NOT EXISTS public.map_3d_model_file_deletions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL,
  company_id      uuid NOT NULL,
  storage_bucket  text NOT NULL,
  storage_path    text NOT NULL,
  size_bytes      bigint,
  source_status   text,
  deleted_by      uuid NOT NULL,
  deleted_at      timestamptz NOT NULL DEFAULT now(),
  delete_reason   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS map_3d_model_file_deletions_project_idx
  ON public.map_3d_model_file_deletions (project_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS map_3d_model_file_deletions_company_idx
  ON public.map_3d_model_file_deletions (company_id, deleted_at DESC);

GRANT SELECT, INSERT ON public.map_3d_model_file_deletions TO authenticated;
GRANT ALL ON public.map_3d_model_file_deletions TO service_role;

ALTER TABLE public.map_3d_model_file_deletions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "map_3d_model_file_deletions_select_same_company"
  ON public.map_3d_model_file_deletions
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "map_3d_model_file_deletions_insert_editors"
  ON public.map_3d_model_file_deletions
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.can_write()
    AND deleted_by = auth.uid()
  );
-- sem UPDATE/DELETE policies: histórico imutável

-- 4) RPC: validação final antes da exclusão real
CREATE OR REPLACE FUNCTION public.validate_3d_model_files_for_delete(
  _project_id uuid,
  _paths      text[]
)
RETURNS TABLE (
  storage_path   text,
  can_delete     boolean,
  blocked_reason text,
  size_bytes     bigint,
  current_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_company uuid := public.get_my_company_id();
BEGIN
  IF my_company IS NULL THEN
    RAISE EXCEPTION 'no_company_for_user';
  END IF;
  IF _project_id IS NULL THEN
    RAISE EXCEPTION 'project_id_required';
  END IF;

  RETURN QUERY
  WITH input_paths AS (
    SELECT DISTINCT p AS path FROM unnest(COALESCE(_paths, ARRAY[]::text[])) AS p
    WHERE p IS NOT NULL AND p <> ''
  ),
  active_paths AS (
    SELECT public.extract_storage_path_from_url(ml.model_3d_url, '3d-models') AS path
    FROM public.map_layouts ml
    WHERE ml.model_3d_url IS NOT NULL AND ml.model_3d_url <> ''
  ),
  parts_paths AS (
    SELECT pmp.storage_path AS path
    FROM public.project_model_parts pmp
    WHERE pmp.storage_path IS NOT NULL
  ),
  obj AS (
    SELECT
      so.name AS path,
      (so.metadata->>'size')::bigint AS size_bytes,
      so.created_at,
      split_part(so.name, '/', 1) AS company_seg,
      NULLIF(split_part(so.name, '/', 2), '') AS project_seg
    FROM storage.objects so
    WHERE so.bucket_id = '3d-models'
      AND so.name IN (SELECT path FROM input_paths)
  ),
  reg AS (
    SELECT f.storage_path AS path, f.status::text AS status, f.preserved, f.project_id, f.company_id
    FROM public.map_3d_model_files f
    WHERE f.storage_path IN (SELECT path FROM input_paths)
  )
  SELECT
    ip.path                                         AS storage_path,
    -- can_delete: passa em TODOS os bloqueios
    CASE
      WHEN ip.path NOT LIKE '%/gltf/%' AND ip.path NOT LIKE '%/gltf-parts/%' THEN false
      WHEN o.path IS NULL THEN false
      WHEN o.company_seg IS NULL OR o.company_seg::uuid <> my_company THEN false
      WHEN o.project_seg IS NULL OR o.project_seg::uuid <> _project_id THEN false
      WHEN EXTRACT(EPOCH FROM (now() - o.created_at)) < (7 * 86400) THEN false
      WHEN ip.path IN (SELECT path FROM active_paths) THEN false
      WHEN ip.path IN (SELECT path FROM parts_paths) THEN false
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND (r.preserved OR r.status = 'active')) THEN false
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND r.company_id <> my_company) THEN false
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND r.project_id <> _project_id) THEN false
      ELSE true
    END AS can_delete,
    CASE
      WHEN ip.path NOT LIKE '%/gltf/%' AND ip.path NOT LIKE '%/gltf-parts/%' THEN 'invalid_path_pattern'
      WHEN o.path IS NULL THEN 'object_not_found_in_bucket'
      WHEN o.company_seg IS NULL OR o.company_seg::uuid <> my_company THEN 'cross_company_blocked'
      WHEN o.project_seg IS NULL OR o.project_seg::uuid <> _project_id THEN 'cross_project_blocked'
      WHEN EXTRACT(EPOCH FROM (now() - o.created_at)) < (7 * 86400) THEN 'too_recent_lt_7d'
      WHEN ip.path IN (SELECT path FROM active_paths) THEN 'active_in_map_layouts'
      WHEN ip.path IN (SELECT path FROM parts_paths) THEN 'referenced_in_project_model_parts'
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND r.status = 'active') THEN 'status_active'
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND r.preserved) THEN 'preserved'
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND r.company_id <> my_company) THEN 'registry_other_company'
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND r.project_id <> _project_id) THEN 'registry_other_project'
      ELSE 'ok'
    END AS blocked_reason,
    o.size_bytes,
    COALESCE((SELECT r.status FROM reg r WHERE r.path = ip.path LIMIT 1), 'unregistered') AS current_status
  FROM input_paths ip
  LEFT JOIN obj o ON o.path = ip.path;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_3d_model_files_for_delete(uuid, text[]) TO authenticated;