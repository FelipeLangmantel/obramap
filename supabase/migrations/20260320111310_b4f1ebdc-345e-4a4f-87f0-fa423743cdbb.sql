
DO $$
DECLARE
  v_project_id UUID;
  v_deleted_spbp INTEGER;
  v_deleted_wps INTEGER;
  v_synced JSONB;
BEGIN
  SELECT id INTO v_project_id
  FROM public.projects
  WHERE name ILIKE '%tapejara%'
  LIMIT 1;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Projeto Tapejara não encontrado';
  END IF;

  RAISE NOTICE 'Projeto: %', v_project_id;

  DELETE FROM public.service_planning_by_period spbp
  WHERE spbp.project_id = v_project_id
    AND NOT EXISTS (
      SELECT 1 FROM public.project_contract_services pcs
      WHERE pcs.project_id = v_project_id
        AND pcs.macro_id = spbp.macro_id::text
        AND pcs.scope_id = spbp.scope_id::text
    );
  GET DIAGNOSTICS v_deleted_spbp = ROW_COUNT;
  RAISE NOTICE 'Removidos % de service_planning_by_period', v_deleted_spbp;

  DELETE FROM public.weekly_plan_services wps
  WHERE wps.project_id = v_project_id
    AND NOT EXISTS (
      SELECT 1 FROM public.project_contract_services pcs
      WHERE pcs.project_id = v_project_id
        AND pcs.macro_id = wps.macro_id
        AND pcs.scope_id = wps.scope_id
    );
  GET DIAGNOSTICS v_deleted_wps = ROW_COUNT;
  RAISE NOTICE 'Removidos % de weekly_plan_services', v_deleted_wps;

  SELECT public.sync_period_services_with_strategic(v_project_id) INTO v_synced;
  RAISE NOTICE 'Sincronização: %', v_synced;
  RAISE NOTICE 'Correção concluída.';
END $$;
