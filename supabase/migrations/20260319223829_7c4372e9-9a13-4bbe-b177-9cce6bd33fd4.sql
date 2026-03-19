
-- 1. Vincular ple_projects a uma obra do ObraMap (opcional — standalone continua funcionando)
ALTER TABLE public.ple_projects
  ADD COLUMN IF NOT EXISTS obramap_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'standalone'
    CHECK (mode IN ('standalone', 'integrated'));

-- 2. Adicionar MAT e MO unitário separados em ple_events
ALTER TABLE public.ple_events
  ADD COLUMN IF NOT EXISTS mat_unit_value NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mo_unit_value NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS obramap_macro_id TEXT,
  ADD COLUMN IF NOT EXISTS obramap_macro_name TEXT,
  ADD COLUMN IF NOT EXISTS obramap_scope_id TEXT,
  ADD COLUMN IF NOT EXISTS obramap_scope_name TEXT;

-- Índice para busca por scope vinculado
CREATE INDEX IF NOT EXISTS idx_ple_events_scope
  ON public.ple_events(obramap_scope_id) WHERE obramap_scope_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ple_events_obramap_project
  ON public.ple_projects(obramap_project_id) WHERE obramap_project_id IS NOT NULL;

-- 3. RPC: Calcular e atualizar project_contract_services a partir dos itens PLE medidos
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
    pst.total_contractual_value / NULLIF((SELECT total_houses FROM projects WHERE id = v_obramap_project_id), 0),
    pst.total_contractual_value / NULLIF((SELECT total_houses FROM projects WHERE id = v_obramap_project_id), 0),
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
