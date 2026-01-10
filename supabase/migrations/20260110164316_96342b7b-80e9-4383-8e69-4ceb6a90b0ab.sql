-- ============================================================
-- FASE 15.4 — GERAR COTAÇÃO A PARTIR DA REQUISIÇÃO
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_quotation_from_purchase_request(
  p_purchase_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_quotation_id uuid;
  v_items_count integer := 0;
BEGIN
  -- Buscar requisição
  SELECT * INTO v_request
  FROM purchase_requests
  WHERE id = p_purchase_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_not_found');
  END IF;

  -- Criar cotação
  INSERT INTO quotations (
    company_id,
    project_id,
    purchase_request_id,
    status,
    created_at
  )
  VALUES (
    v_request.company_id,
    v_request.project_id,
    p_purchase_request_id,
    'open',
    now()
  )
  RETURNING id INTO v_quotation_id;

  -- Copiar itens da requisição para itens da cotação
  INSERT INTO quotation_items (
    quotation_id,
    purchase_request_item_id,
    input_id,
    name,
    unit,
    quantity
  )
  SELECT
    v_quotation_id,
    pri.id,
    pri.input_id,
    pri.input_name,
    pri.unit,
    pri.quantity_requested
  FROM purchase_request_items pri
  WHERE pri.purchase_request_id = p_purchase_request_id;

  GET DIAGNOSTICS v_items_count = ROW_COUNT;

  -- Atualizar status da requisição
  UPDATE purchase_requests
  SET status = 'quoted',
      updated_at = now()
  WHERE id = p_purchase_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'quotation_id', v_quotation_id,
    'items_created', v_items_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_quotation_from_purchase_request(uuid) TO authenticated;