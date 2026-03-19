
-- Add billing_type to ple_events
ALTER TABLE public.ple_events
  ADD COLUMN IF NOT EXISTS billing_type TEXT NOT NULL DEFAULT 'per_house'
    CHECK (billing_type IN ('per_house', 'fixed'));

-- Recreate sync_contract_from_ple with billing_type logic
CREATE OR REPLACE FUNCTION public.sync_contract_from_ple(p_ple_project_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_obramap_project_id UUID;
  v_contract_id UUID;
  v_synced INTEGER := 0;
BEGIN
  SELECT obramap_project_id INTO v_obramap_project_id
  FROM ple_projects WHERE id = p_ple_project_id;

  IF v_obramap_project_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ple_project_not_linked',
      'message', 'Este projeto PLE não está vinculado a uma obra do ObraMap');
  END IF;

  SELECT id INTO v_contract_id
  FROM project_contracts
  WHERE project_id = v_obramap_project_id
  ORDER BY created_at DESC LIMIT 1;

  IF v_contract_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_contract',
      'message', 'Nenhum contrato encontrado para a obra vinculada');
  END IF;

  WITH ple_scope_totals AS (
    SELECT
      e.obramap_macro_id,
      e.obramap_macro_name,
      e.obramap_scope_id,
      e.obramap_scope_name,
      COUNT(DISTINCT en.house_number) AS total_houses_measured,
      SUM(
        CASE
          WHEN e.billing_type = 'fixed'
          THEN e.quantity * e.unit_value
          ELSE e.quantity * e.unit_value / NULLIF((SELECT total_houses FROM projects WHERE id = v_obramap_project_id), 0)
        END
      ) AS unit_revenue,
      SUM(e.quantity * e.unit_value) AS total_contractual_value,
      SUM(e.quantity * e.mat_unit_value) AS total_mat_value,
      SUM(e.quantity * e.mo_unit_value) AS total_mo_value
    FROM ple_events e
    LEFT JOIN ple_entries en ON en.event_id = e.id AND en.ple_project_id = p_ple_project_id
    WHERE e.ple_project_id = p_ple_project_id
      AND e.obramap_scope_id IS NOT NULL
    GROUP BY e.obramap_macro_id, e.obramap_macro_name, e.obramap_scope_id, e.obramap_scope_name
  )
  INSERT INTO project_contract_services (
    company_id, project_id, contract_id,
    macro_id, macro_name, scope_id, scope_name,
    unit_revenue_value, max_cost_value, status
  )
  SELECT
    (SELECT company_id FROM projects WHERE id = v_obramap_project_id),
    v_obramap_project_id,
    v_contract_id,
    pst.obramap_macro_id,
    pst.obramap_macro_name,
    pst.obramap_scope_id,
    pst.obramap_scope_name,
    pst.unit_revenue,
    pst.unit_revenue,
    'active'
  FROM ple_scope_totals pst
  ON CONFLICT (contract_id, macro_id, scope_id) DO UPDATE SET
    unit_revenue_value = EXCLUDED.unit_revenue_value,
    max_cost_value = EXCLUDED.max_cost_value,
    updated_at = now();

  GET DIAGNOSTICS v_synced = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'synced_services', v_synced,
    'obramap_project_id', v_obramap_project_id);
END;
$$;
