-- ============================================================
-- RPC: sincronizar serviços do projeto com contrato da obra
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_contract_services(
  p_project_id uuid,
  p_company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract_id uuid;
  v_count integer := 0;
BEGIN
  -- contrato ativo do projeto
  SELECT id INTO v_contract_id
  FROM project_contracts
  WHERE project_id = p_project_id
    AND company_id = p_company_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_contract_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'contract_not_found');
  END IF;

  -- inserir serviços faltantes baseado em measurement_services
  INSERT INTO project_contract_services (
    company_id,
    project_id,
    contract_id,
    macro_id,
    scope_id,
    macro_name,
    scope_name,
    unit_revenue_value,
    status
  )
  SELECT DISTINCT
    p_company_id,
    p_project_id,
    v_contract_id,
    ms.macro_id,
    ms.scope_id,
    ms.macro_name,
    ms.scope_name,
    0,
    'pending'
  FROM measurement_services ms
  WHERE ms.project_id = p_project_id
    AND ms.company_id = p_company_id
    AND NOT EXISTS (
      SELECT 1 FROM project_contract_services cs
      WHERE cs.contract_id = v_contract_id
        AND cs.macro_id = ms.macro_id
        AND cs.scope_id = ms.scope_id
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'inserted', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_contract_services(uuid, uuid) TO authenticated;