-- ============================================================================
-- Permite exclusao manual de modelos 3D recentes apenas para administrador
-- da empresa, com confirmacao extra no client/Edge Function.
-- Tambem move o reset de vinculos 3D para RPC com validacao de admin.
-- ============================================================================

DROP FUNCTION IF EXISTS public.validate_3d_model_files_for_delete(uuid, text[]);
DROP FUNCTION IF EXISTS public.validate_3d_model_files_for_delete(uuid, text[], boolean);

CREATE OR REPLACE FUNCTION public.validate_3d_model_files_for_delete(
  _project_id uuid,
  _paths      text[],
  _allow_recent_delete boolean DEFAULT false
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
  is_company_admin_user boolean := false;
BEGIN
  IF my_company IS NULL THEN
    RAISE EXCEPTION 'no_company_for_user';
  END IF;
  IF _project_id IS NULL THEN
    RAISE EXCEPTION 'project_id_required';
  END IF;

  SELECT public.is_company_admin(auth.uid(), my_company)
  INTO is_company_admin_user;

  IF _allow_recent_delete AND NOT COALESCE(is_company_admin_user, false) THEN
    RAISE EXCEPTION 'Apenas administrador da empresa pode excluir arquivos recentes.';
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
    ip.path AS storage_path,
    CASE
      WHEN ip.path NOT LIKE '%/gltf/%' AND ip.path NOT LIKE '%/gltf-parts/%' THEN false
      WHEN o.path IS NULL THEN false
      WHEN o.company_seg IS NULL OR o.company_seg::uuid <> my_company THEN false
      WHEN o.project_seg IS NULL OR o.project_seg::uuid <> _project_id THEN false
      WHEN ip.path IN (SELECT path FROM active_paths) THEN false
      WHEN ip.path IN (SELECT path FROM parts_paths) THEN false
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND (r.preserved OR r.status = 'active')) THEN false
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND r.company_id <> my_company) THEN false
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND r.project_id <> _project_id) THEN false
      WHEN EXTRACT(EPOCH FROM (now() - o.created_at)) < (7 * 86400)
        AND NOT (_allow_recent_delete AND COALESCE(is_company_admin_user, false)) THEN false
      ELSE true
    END AS can_delete,
    CASE
      WHEN ip.path NOT LIKE '%/gltf/%' AND ip.path NOT LIKE '%/gltf-parts/%' THEN 'invalid_path_pattern'
      WHEN o.path IS NULL THEN 'object_not_found_in_bucket'
      WHEN o.company_seg IS NULL OR o.company_seg::uuid <> my_company THEN 'cross_company_blocked'
      WHEN o.project_seg IS NULL OR o.project_seg::uuid <> _project_id THEN 'cross_project_blocked'
      WHEN ip.path IN (SELECT path FROM active_paths) THEN 'active_in_map_layouts'
      WHEN ip.path IN (SELECT path FROM parts_paths) THEN 'referenced_in_project_model_parts'
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND r.status = 'active') THEN 'status_active'
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND r.preserved) THEN 'preserved'
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND r.company_id <> my_company) THEN 'registry_other_company'
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND r.project_id <> _project_id) THEN 'registry_other_project'
      WHEN EXTRACT(EPOCH FROM (now() - o.created_at)) < (7 * 86400)
        AND NOT (_allow_recent_delete AND COALESCE(is_company_admin_user, false)) THEN 'too_recent_lt_7d'
      ELSE 'ok'
    END AS blocked_reason,
    o.size_bytes,
    COALESCE((SELECT r.status FROM reg r WHERE r.path = ip.path LIMIT 1), 'unregistered') AS current_status
  FROM input_paths ip
  LEFT JOIN obj o ON o.path = ip.path;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_3d_model_files_for_delete(uuid, text[], boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.reset_3d_model_links_for_project(_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_company uuid := public.get_my_company_id();
  project_company uuid;
  deleted_assignments integer := 0;
  deleted_layer_links integer := 0;
  deleted_meshes integer := 0;
BEGIN
  IF my_company IS NULL THEN
    RAISE EXCEPTION 'no_company_for_user';
  END IF;
  IF _project_id IS NULL THEN
    RAISE EXCEPTION 'project_id_required';
  END IF;

  SELECT company_id INTO project_company
  FROM public.projects
  WHERE id = _project_id;

  IF project_company IS NULL OR project_company <> my_company THEN
    RAISE EXCEPTION 'project_not_found_or_cross_company';
  END IF;

  IF NOT public.is_company_admin(auth.uid(), project_company) THEN
    RAISE EXCEPTION 'Apenas administrador da empresa pode resetar vinculos do modelo 3D.';
  END IF;

  DELETE FROM public.map_mesh_house_assignments WHERE project_id = _project_id;
  GET DIAGNOSTICS deleted_assignments = ROW_COUNT;

  DELETE FROM public.map_layer_stage_links WHERE project_id = _project_id;
  GET DIAGNOSTICS deleted_layer_links = ROW_COUNT;

  DELETE FROM public.project_model_meshes WHERE project_id = _project_id;
  GET DIAGNOSTICS deleted_meshes = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'map_mesh_house_assignments', deleted_assignments,
    'map_layer_stage_links', deleted_layer_links,
    'project_model_meshes', deleted_meshes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_3d_model_links_for_project(uuid) TO authenticated;

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
  parts_paths AS (
    SELECT pmp.storage_path AS path
    FROM public.project_model_parts pmp
    WHERE pmp.storage_path IS NOT NULL
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
      WHEN o.storage_path IN (SELECT path FROM parts_paths) THEN 'referenced_in_project_model_parts'
      WHEN EXISTS (SELECT 1 FROM registered r WHERE r.storage_path = o.storage_path AND r.preserved) THEN 'preserved'
      WHEN EXISTS (SELECT 1 FROM registered r WHERE r.storage_path = o.storage_path AND r.status = 'active') THEN 'registered_active'
      WHEN EXTRACT(DAY FROM (now() - o.created_at)) < 7 THEN 'too_recent(<7d)'
      ELSE 'orphan_candidate'
    END AS reason,
    CASE
      WHEN o.storage_path IN (SELECT path FROM active_paths) THEN false
      WHEN o.storage_path IN (SELECT path FROM parts_paths) THEN false
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
