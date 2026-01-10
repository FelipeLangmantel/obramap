-- ============================================================
-- RPC: aplicar contrato no planejamento
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_contract_to_planning(
  p_contract_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  -- Atualiza os valores de receita no planejamento por período
  UPDATE service_planning_by_period sp
  SET
    unit_revenue_value = cs.unit_revenue_value,
    updated_at = now()
  FROM project_contract_services cs
  WHERE sp.contract_id = cs.contract_id
    AND sp.macro_id = cs.macro_id
    AND sp.scope_id = cs.scope_id
    AND cs.contract_id = p_contract_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'updated', v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_contract_to_planning(uuid) TO authenticated;