-- Atualiza RPC de validação para aceitar _allow_recent_delete e bloquear /ifc/ explicitamente.
-- Também cria reset_3d_model_links_for_project (admin-only) que NÃO apaga storage.
DROP FUNCTION IF EXISTS public.validate_3d_model_files_for_delete(uuid, text[]);

CREATE OR REPLACE FUNCTION public.validate_3d_model_files_for_delete(
  _project_id uuid,
  _paths text[],
  _allow_recent_delete boolean DEFAULT false
)
RETURNS TABLE(
  storage_path text,
  can_delete boolean,
  blocked_reason text,
  size_bytes bigint,
  current_status text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    ip.path AS storage_path,
    CASE
      WHEN ip.path LIKE '%/ifc/%' THEN false
      WHEN ip.path NOT LIKE '%/gltf/%' AND ip.path NOT LIKE '%/gltf-parts/%' THEN false
      WHEN o.path IS NULL THEN false
      WHEN o.company_seg IS NULL OR o.company_seg::uuid <> my_company THEN false
      WHEN o.project_seg IS NULL OR o.project_seg::uuid <> _project_id THEN false
      WHEN (NOT _allow_recent_delete) AND EXTRACT(EPOCH FROM (now() - o.created_at)) < (7 * 86400) THEN false
      WHEN ip.path IN (SELECT path FROM active_paths) THEN false
      WHEN ip.path IN (SELECT path FROM parts_paths) THEN false
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND (r.preserved OR r.status = 'active')) THEN false
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND r.company_id <> my_company) THEN false
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND r.project_id <> _project_id) THEN false
      ELSE true
    END AS can_delete,
    CASE
      WHEN ip.path LIKE '%/ifc/%' THEN 'ifc_out_of_scope'
      WHEN ip.path NOT LIKE '%/gltf/%' AND ip.path NOT LIKE '%/gltf-parts/%' THEN 'path_out_of_scope'
      WHEN o.path IS NULL THEN 'object_not_found_in_bucket'
      WHEN o.company_seg IS NULL OR o.company_seg::uuid <> my_company THEN 'cross_company_blocked'
      WHEN o.project_seg IS NULL OR o.project_seg::uuid <> _project_id THEN 'cross_project_blocked'
      WHEN (NOT _allow_recent_delete) AND EXTRACT(EPOCH FROM (now() - o.created_at)) < (7 * 86400) THEN 'too_recent_lt_7d'
      WHEN ip.path IN (SELECT path FROM active_paths) THEN 'active_in_map_layouts'
      WHEN ip.path IN (SELECT path FROM parts_paths) THEN 'referenced_in_project_model_parts'
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND r.status = 'active') THEN 'status_active'
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND r.preserved) THEN 'preserved'
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND r.company_id <> my_company) THEN 'registry_other_company'
      WHEN EXISTS (SELECT 1 FROM reg r WHERE r.path = ip.path AND r.project_id <> _project_id) THEN 'registry_other_project'
      ELSE 'ok'
    END AS blocked_reason,
    o.size_bytes,
    COALESCE((SELECT r.status FROM reg r WHERE r.path = ip.path LIMIT 1), 'unknown') AS current_status
  FROM input_paths ip
  LEFT JOIN obj o ON o.path = ip.path
  ORDER BY ip.path;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.validate_3d_model_files_for_delete(uuid, text[], boolean) TO authenticated, service_role;

-- Reset de vínculos (admin-only). NÃO apaga storage. Apenas limpa map_layouts.model_3d_url
-- e marca files do projeto como orphan_pending_delete para auditoria posterior.
CREATE OR REPLACE FUNCTION public.reset_3d_model_links_for_project(_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  my_company uuid := public.get_my_company_id();
  v_project_company uuid;
  v_layouts_updated int := 0;
  v_files_marked int := 0;
BEGIN
  IF my_company IS NULL THEN RAISE EXCEPTION 'no_company_for_user'; END IF;
  IF _project_id IS NULL THEN RAISE EXCEPTION 'project_id_required'; END IF;

  SELECT company_id INTO v_project_company FROM public.projects WHERE id = _project_id;
  IF v_project_company IS NULL OR v_project_company <> my_company THEN
    RAISE EXCEPTION 'project_not_in_company';
  END IF;
  IF NOT public.is_company_admin(auth.uid(), my_company) THEN
    RAISE EXCEPTION 'not_company_admin';
  END IF;

  UPDATE public.map_layouts
     SET model_3d_url = NULL,
         updated_at = now()
   WHERE project_id = _project_id
     AND model_3d_url IS NOT NULL;
  GET DIAGNOSTICS v_layouts_updated = ROW_COUNT;

  UPDATE public.map_3d_model_files
     SET status = 'orphan_pending_delete',
         notes = COALESCE(notes, '') || ' [reset_links ' || now()::text || ']'
   WHERE project_id = _project_id
     AND company_id = my_company
     AND status NOT IN ('deleted', 'preserved');
  GET DIAGNOSTICS v_files_marked = ROW_COUNT;

  RETURN jsonb_build_object(
    'layouts_updated', v_layouts_updated,
    'files_marked_orphan', v_files_marked
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reset_3d_model_links_for_project(uuid) TO authenticated, service_role;