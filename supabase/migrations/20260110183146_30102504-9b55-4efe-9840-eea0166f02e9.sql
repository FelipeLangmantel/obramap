-- ============================================================
-- RPC: validar se contrato está completo
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_contract_ready(
  p_contract_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing integer;
  v_total integer;
BEGIN
  -- conta serviços sem valor definido
  SELECT COUNT(*) INTO v_missing
  FROM project_contract_services
  WHERE contract_id = p_contract_id
    AND (unit_revenue_value IS NULL OR unit_revenue_value = 0);

  -- conta total de serviços
  SELECT COUNT(*) INTO v_total
  FROM project_contract_services
  WHERE contract_id = p_contract_id;

  IF v_missing > 0 THEN
    RETURN jsonb_build_object(
      'success', false, 
      'missing_services', v_missing,
      'total_services', v_total
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'total_services', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_contract_ready(uuid) TO authenticated;