-- Corrige a RPC de reset de vínculos do modelo 3D.
-- Regra: limpar apenas vínculos/inventário 3D do projeto, sem apagar GLB,
-- sem alterar map_layouts.model_3d_url e sem mexer em project_model_parts.

CREATE OR REPLACE FUNCTION public.reset_3d_model_links_for_project(_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  my_company uuid := public.get_my_company_id();
  v_project_company uuid;
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

  SELECT company_id
    INTO v_project_company
    FROM public.projects
   WHERE id = _project_id;

  IF v_project_company IS NULL OR v_project_company <> my_company THEN
    RAISE EXCEPTION 'project_not_in_company';
  END IF;

  IF NOT public.is_company_admin(auth.uid(), v_project_company) THEN
    RAISE EXCEPTION 'not_company_admin';
  END IF;

  DELETE FROM public.map_mesh_house_assignments
   WHERE project_id = _project_id;
  GET DIAGNOSTICS deleted_assignments = ROW_COUNT;

  DELETE FROM public.map_layer_stage_links
   WHERE project_id = _project_id;
  GET DIAGNOSTICS deleted_layer_links = ROW_COUNT;

  DELETE FROM public.project_model_meshes
   WHERE project_id = _project_id;
  GET DIAGNOSTICS deleted_meshes = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'map_mesh_house_assignments', deleted_assignments,
    'map_layer_stage_links', deleted_layer_links,
    'project_model_meshes', deleted_meshes
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reset_3d_model_links_for_project(uuid) TO authenticated, service_role;
