-- ============================================================
-- FASE 15.5 — GERAR PEDIDO DE COMPRA A PARTIR DA COTAÇÃO
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_purchase_order_from_quotation(
  p_quotation_id uuid,
  p_supplier_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quotation RECORD;
  v_order_id uuid;
  v_items_count integer := 0;
BEGIN
  -- Buscar cotação
  SELECT * INTO v_quotation
  FROM quotations
  WHERE id = p_quotation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'quotation_not_found');
  END IF;

  -- Criar pedido de compra
  INSERT INTO purchase_orders (
    company_id,
    project_id,
    quotation_id,
    supplier_id,
    status,
    created_at
  )
  VALUES (
    v_quotation.company_id,
    v_quotation.project_id,
    p_quotation_id,
    p_supplier_id,
    'ordered',
    now()
  )
  RETURNING id INTO v_order_id;

  -- Copiar itens da cotação para itens do pedido
  INSERT INTO purchase_order_items (
    purchase_order_id,
    quotation_item_id,
    input_id,
    name,
    unit,
    quantity,
    status
  )
  SELECT
    v_order_id,
    qi.id,
    qi.input_id,
    qi.name,
    qi.unit,
    qi.quantity,
    'ordered'
  FROM quotation_items qi
  WHERE qi.quotation_id = p_quotation_id;

  GET DIAGNOSTICS v_items_count = ROW_COUNT;

  -- Atualizar status da cotação
  UPDATE quotations
  SET status = 'ordered',
      updated_at = now()
  WHERE id = p_quotation_id;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_order_id', v_order_id,
    'items_created', v_items_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_purchase_order_from_quotation(uuid, uuid) TO authenticated;