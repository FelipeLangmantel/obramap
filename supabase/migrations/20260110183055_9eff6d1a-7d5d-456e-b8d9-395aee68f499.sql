-- ============================================================
-- RPC: definir valor da etapa e distribuir para serviços
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_contract_macro_value(
  p_contract_id uuid,
  p_macro_id uuid,
  p_total_value numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum_weights numeric;
  v_service_count integer;
BEGIN
  -- soma dos pesos dos serviços da etapa (se existir coluna weight_percent)
  SELECT COALESCE(SUM(COALESCE(ms.productivity_expected, 1)), 0)
  INTO v_sum_weights
  FROM measurement_services ms
  WHERE ms.macro_id = p_macro_id;

  -- conta serviços da etapa no contrato
  SELECT COUNT(*) INTO v_service_count
  FROM project_contract_services
  WHERE contract_id = p_contract_id
    AND macro_id = p_macro_id;

  -- se não tiver serviços, retorna erro
  IF v_service_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_services_found');
  END IF;

  -- dividir igualmente entre os serviços da etapa
  UPDATE project_contract_services cs
  SET unit_revenue_value = p_total_value / v_service_count,
      status = CASE WHEN p_total_value > 0 THEN 'active' ELSE 'pending' END,
      updated_at = now()
  WHERE cs.contract_id = p_contract_id
    AND cs.macro_id = p_macro_id;

  RETURN jsonb_build_object('success', true, 'updated', v_service_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_contract_macro_value(uuid, uuid, numeric) TO authenticated;