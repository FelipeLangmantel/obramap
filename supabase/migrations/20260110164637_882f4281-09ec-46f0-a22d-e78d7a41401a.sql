-- ============================================================
-- FASE 15.6 — CONTROLE DE ENTREGA E IMPACTO NA PRODUÇÃO
-- ============================================================

-- -----------------------------
-- 1) CAMPOS EM PURCHASE_ORDERS
-- -----------------------------
ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS expected_delivery_date date,
ADD COLUMN IF NOT EXISTS delivered_at date,
ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'ordered';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'purchase_orders_delivery_status_check'
  ) THEN
    ALTER TABLE public.purchase_orders
    ADD CONSTRAINT purchase_orders_delivery_status_check
    CHECK (delivery_status IN ('ordered','in_transit','delivered','delayed'));
  END IF;
END $$;

-- -----------------------------
-- 2) ATUALIZAR SUPRIMENTOS POR ENTREGA
-- -----------------------------
CREATE OR REPLACE FUNCTION public.sync_supply_on_delivery(
  p_purchase_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Atualizar quantidade entregue por insumo no período
  UPDATE period_supply_requirements psr
  SET
    quantity_delivered = COALESCE(psr.quantity_delivered,0) + poi.quantity,
    supply_status = CASE
      WHEN (COALESCE(psr.quantity_delivered,0) + poi.quantity) >= psr.quantity_required
        THEN 'ok'
      ELSE 'attention'
    END,
    updated_at = now()
  FROM purchase_order_items poi
  JOIN purchase_orders po ON po.id = poi.purchase_order_id
  WHERE poi.purchase_order_id = p_purchase_order_id
    AND psr.input_id = poi.input_id
    AND psr.project_id = po.project_id;
END;
$$;

-- -----------------------------
-- 3) MARCAR RISCO SE ENTREGA ATRASAR
-- -----------------------------
CREATE OR REPLACE FUNCTION public.recalculate_supply_risk_on_orders(
  p_project_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE service_planning_by_period sp
  SET
    supply_risk = EXISTS (
      SELECT 1
      FROM period_supply_requirements psr
      WHERE psr.service_plan_id = sp.id
        AND psr.supply_status = 'critical'
    ),
    updated_at = now()
  WHERE sp.project_id = p_project_id;
END;
$$;

-- -----------------------------
-- 4) TRIGGER AO ATUALIZAR PEDIDO
-- -----------------------------
CREATE OR REPLACE FUNCTION public.trigger_purchase_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.delivery_status = 'delivered'
     AND OLD.delivery_status IS DISTINCT FROM 'delivered' THEN
    PERFORM sync_supply_on_delivery(NEW.id);
    PERFORM recalculate_supply_risk_on_orders(NEW.project_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_delivery ON public.purchase_orders;

CREATE TRIGGER trg_purchase_delivery
AFTER UPDATE ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_purchase_delivery();