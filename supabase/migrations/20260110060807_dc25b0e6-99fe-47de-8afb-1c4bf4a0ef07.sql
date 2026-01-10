-- ============================================================
-- PASSO 11.2 — DASHBOARD FINANCEIRO DO CONTRATO
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_contract_financial_dashboard(
  p_contract_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract RECORD;
  v_planned_cost numeric;
  v_realized_cost numeric;
  v_received numeric;
  v_balance_to_receive numeric;
  v_real_result numeric;
BEGIN
  -- Dados do contrato
  SELECT * INTO v_contract
  FROM project_contracts
  WHERE id = p_contract_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'contract_not_found');
  END IF;

  -- Custo planejado (todas medições do projeto do contrato)
  SELECT COALESCE(SUM(planned_cost), 0)
  INTO v_planned_cost
  FROM measurements
  WHERE project_id = v_contract.project_id;

  -- Custo realizado (produção)
  SELECT COALESCE(SUM(realized_cost), 0)
  INTO v_realized_cost
  FROM measurements
  WHERE project_id = v_contract.project_id;

  -- Valor recebido da Caixa
  SELECT COALESCE(SUM(amount_received), 0)
  INTO v_received
  FROM contract_receipts
  WHERE contract_id = p_contract_id;

  -- Saldo a receber
  v_balance_to_receive := v_contract.contract_value_total - v_received;

  -- Resultado real (recebido - gasto)
  v_real_result := v_received - v_realized_cost;

  RETURN jsonb_build_object(
    'contract_id', p_contract_id,
    'contract_total_value', v_contract.contract_value_total,
    'planned_cost', v_planned_cost,
    'realized_cost', v_realized_cost,
    'received', v_received,
    'balance_to_receive', v_balance_to_receive,
    'real_result', v_real_result,
    'planned_margin', v_contract.contract_value_total - v_planned_cost,
    'real_margin', v_real_result,
    'updated_at', now()
  );
END;
$$;